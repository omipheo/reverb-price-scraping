const Anthropic = require("@anthropic-ai/sdk");
const cache = require("./productCache");

const MODEL = "claude-sonnet-4-6";
const MAX_CANDIDATES = 30;       // top candidates sent to Claude per query
const CACHE_MAX = 5000;          // max in-memory cache entries
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 1 day

let _client = null;
function getClient() {
  if (!_client) {
    if (!process.env.ANTHROPIC_API_KEY) return null;
    _client = new Anthropic.default({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return _client;
}

// Simple LRU-ish cache: Map preserves insertion order, oldest is first
const _aiCache = new Map();

function cacheGet(key) {
  const entry = _aiCache.get(key);
  if (!entry) return undefined;
  if (Date.now() - entry.t > CACHE_TTL_MS) {
    _aiCache.delete(key);
    return undefined;
  }
  // Refresh recency
  _aiCache.delete(key);
  _aiCache.set(key, entry);
  return entry.v;
}

function cacheSet(key, value) {
  if (_aiCache.size >= CACHE_MAX) {
    const oldest = _aiCache.keys().next().value;
    _aiCache.delete(oldest);
  }
  _aiCache.set(key, { v: value, t: Date.now() });
}

/**
 * Build the candidate list to send to Claude. Tries to filter by query terms first
 * (smaller, more relevant set), then falls back to top popular products.
 */
function buildCandidates(normalizedQuery) {
  const terms = normalizedQuery.split(/\s+/).filter((t) => t.length >= 3);
  // Try to find candidates that contain at least one query term
  let candidates = cache.topCandidates(terms, MAX_CANDIDATES);
  // If too few, broaden to popular products
  if (candidates.length < 10) {
    candidates = cache.topCandidates([], MAX_CANDIDATES);
  }
  return candidates;
}

/**
 * Ask Claude to pick the best match (or "none") from candidates.
 * Returns the matched product document or null.
 */
async function findMatchWithClaude(pedalName, normalizedQuery) {
  const client = getClient();
  if (!client) {
    console.warn("[aiMatcher] ANTHROPIC_API_KEY not set; skipping AI fallback");
    return null;
  }

  const cacheKey = normalizedQuery.toLowerCase();
  const cached = cacheGet(cacheKey);
  if (cached !== undefined) {
    return cached ? cache.getFullProduct(cached) : null;
  }

  const candidates = buildCandidates(normalizedQuery);
  if (candidates.length === 0) {
    cacheSet(cacheKey, null);
    return null;
  }

  // Build a numbered list of candidate titles for Claude
  const candidateLines = candidates.map((c, i) => `${i + 1}. ${c.title}`).join("\n");

  const prompt = `You are matching guitar pedal names from user input to product titles in a database. Accuracy matters more than coverage — when in doubt, return "none".

User input: "${pedalName}"

Candidate products (numbered list):
${candidateLines}

Strict matching rules (ALL must apply for a match):
1. The candidate must be the SAME BRAND as the user input (Marshall ≠ ProCo, ozfuzz ≠ Hartman, etc.).
2. The candidate must be the SAME MODEL or a clear renaming/typo of it (e.g. "TS-9" matches "TS9 Tube Screamer"). A different model from the same brand is NOT a match (e.g. "Marshall Rat" does NOT match "Marshall Regenerator", "Crazy Tube Circuits Heatseeker" does NOT match "Crazy Tube Circuits Falcon").
3. The candidate must be the SAME PRODUCT TYPE (a pedal query should not match a guitar, amp, pickup, or footswitch-only product unless the user explicitly asked for that).
4. If the user asked for a specific variant or version (e.g. "v2", "mini", "deluxe", "bass"), the candidate should match that variant — but if user did NOT specify, prefer the base model.

If a candidate clearly satisfies all rules, respond with ONLY its number (e.g. "7").
If NO candidate is a confident match, respond with ONLY "none". It is better to say "none" than to guess.

Do not include any explanation. Respond with just the number or "none".`;

  let resp;
  try {
    resp = await client.messages.create({
      model: MODEL,
      max_tokens: 10,
      messages: [{ role: "user", content: prompt }],
    });
  } catch (err) {
    console.error("[aiMatcher] Claude API error:", err?.message || err);
    return null;
  }

  const text = (resp?.content?.[0]?.text || "").trim().toLowerCase();
  if (text === "none" || text.startsWith("none")) {
    cacheSet(cacheKey, null);
    return null;
  }

  // Parse leading number
  const match = text.match(/^\d+/);
  if (!match) {
    console.warn("[aiMatcher] Unexpected Claude response:", text);
    cacheSet(cacheKey, null);
    return null;
  }
  const idx = parseInt(match[0], 10) - 1;
  if (idx < 0 || idx >= candidates.length) {
    cacheSet(cacheKey, null);
    return null;
  }

  const winner = candidates[idx];
  cacheSet(cacheKey, winner._id);
  console.log(`[aiMatcher] "${pedalName}" → "${winner.title}"`);
  return cache.getFullProduct(winner._id);
}

module.exports = {
  findMatchWithClaude,
};
