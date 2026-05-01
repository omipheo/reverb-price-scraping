const Product = require("../model/product.mdl");
const { normalizePedalName } = require("../utils/normalization");
const cache = require("./productCache");
const { findMatchWithClaude } = require("./aiMatcher");

// Product title substrings that indicate non-pedal (e.g. mic, accessory). If query doesn't imply these, prefer other matches.
const NON_PEDAL_KEYWORDS = [
  "microphone", "shockmount", "mic ", " cable", "adapter", "power supply",
  "patch cable", "mount", "stand ", "bag", "case only",
].map((s) => s.toLowerCase());

function productLooksLikeNonPedal(normalizedTitle) {
  if (!normalizedTitle) return false;
  const t = normalizedTitle.toLowerCase();
  return NON_PEDAL_KEYWORDS.some((kw) => t.includes(kw));
}

function queryImpliesNonPedal(normalizedQuery) {
  if (!normalizedQuery) return false;
  const q = normalizedQuery.toLowerCase();
  return NON_PEDAL_KEYWORDS.some((kw) => q.includes(kw));
}

// Reject a candidate if it looks like a non-pedal and the query doesn't imply that
function filterNonPedalCandidate(title, normalizedQuery) {
  if (!title) return true;
  if (queryImpliesNonPedal(normalizedQuery)) return false; // keep
  return !productLooksLikeNonPedal(title);
}

// Generic words that often match unrelated products (e.g. "pink" -> Roto Pinks strings). If query has
// distinctive terms (brand/model), require product to contain at least one so "Light Pink Keeley Katana" matches Keeley pedal not strings.
const GENERIC_WORDS = new Set([
  "light", "pink", "blue", "red", "black", "white", "green", "orange", "yellow", "grey", "gray",
  "mini", "micro", "standard", "v1", "v2", "mk", "mki", "mkii", "usa", "us", "uk", "ii", "iii",
  "pedal", "pedals", "guitar", "bass", "amp", "box", "new", "old", "pro", "full", "small", "big",
]);

// Variant modifier words — when user types plain "Boss DS-1", we should NOT pick a title containing
// these words unless the user explicitly asked for them. Avoids "Boss DS-1" → "DS-1 40th Anniversary".
const VARIANT_WORDS = new Set([
  "mini", "micro", "lil", "anniversary", "limited", "edition", "ltd",
  "deluxe", "compact", "macro", "maxi", "junior", "jr",
  "vintage", "reissue", "nano",
  "40th", "50th", "30th", "25th", "20th", "10th", "5th",
]);
function getDistinctiveTerms(searchTerms) {
  return searchTerms.filter((t) => t.length >= 2 && !GENERIC_WORDS.has(t.toLowerCase()));
}
function productHasDistinctiveTerm(title, distinctiveTerms) {
  if (!distinctiveTerms.length || !title) return true;
  // Count distinctive terms appearing as whole words in title (not substrings).
  // Require at least 2 whole-word matches when query has 2+ distinctive terms;
  // 1 match for single-term queries. Prevents "marshall rat" matching "Marshall Regenerator"
  // (where "rat" is a substring of "regenerator" but not a word).
  let wordMatches = 0;
  for (const term of distinctiveTerms) {
    if (titleHasWord(title, term)) wordMatches++;
  }
  const required = distinctiveTerms.length >= 2 ? 2 : 1;
  return wordMatches >= required;
}

// Check whether `term` appears in `title` as a whole word (boundary on both sides).
// Prevents "lunar" matching inside "lunareclipse", or "fuzz" inside "fuzzrocious".
function titleHasWord(title, term) {
  if (!title || !term) return false;
  const isWordChar = (ch) => /[a-z0-9]/.test(ch);
  let idx = title.indexOf(term);
  while (idx !== -1) {
    const before = idx === 0 ? " " : title[idx - 1];
    const after = idx + term.length >= title.length ? " " : title[idx + term.length];
    if (!isWordChar(before) && !isWordChar(after)) return true;
    idx = title.indexOf(term, idx + 1);
  }
  return false;
}

// 2-letter model codes (e.g. "ce" in CE-20, "re" in RE-20). Require product to contain as a word so "Boss CE-20" doesn't match "Boss RE-20" (RE-20 has "ce" inside "space").
const TWO_LETTER_SKIP = new Set(["us", "uk", "ii", "mk", "v1", "v2"]); // avoid requiring these as model codes
function getModelCodeTerms(searchTerms) {
  return searchTerms.filter((t) => /^[a-z]{2}$/i.test(t) && !TWO_LETTER_SKIP.has(t.toLowerCase()));
}
// Code must appear as a word (not inside "space" or "piece") so CE-20 doesn't match RE-20 Space Echo
function productHasModelCode(title, modelCodeTerms) {
  if (!modelCodeTerms.length || !title) return true;
  const isWordChar = (ch) => /[a-z0-9]/.test(ch);
  return modelCodeTerms.every((code) => {
    const c = code.toLowerCase();
    let idx = title.indexOf(c);
    while (idx !== -1) {
      const before = idx === 0 ? " " : title[idx - 1];
      const after = idx + c.length >= title.length ? " " : title[idx + c.length];
      if (!isWordChar(before) && !isWordChar(after)) return true;
      idx = title.indexOf(c, idx + 1);
    }
    return false;
  });
}

// Shared candidate filter — operates on lowercased title strings from cache
function passesFilters(title, normalized, distinctiveTerms, modelCodeTerms, digitTerms) {
  if (!filterNonPedalCandidate(title, normalized)) return false;
  if (!productHasDistinctiveTerm(title, distinctiveTerms)) return false;
  if (!productHasModelCode(title, modelCodeTerms)) return false;
  // Digit must appear as a whole word (so "2" in query doesn't match "2w" or "20" in title)
  if (digitTerms.length > 0 && !digitTerms.some((d) => titleHasWord(title, d))) return false;
  return true;
}

// Utility: Find best matching product — uses in-memory cache when available, falls back to DB
async function findMatchingProduct(pedalName, condition = null) {
  if (cache.isReady()) {
    return findMatchingProductCached(pedalName);
  }
  // Fallback to DB queries if cache hasn't loaded yet (e.g. during startup)
  return findMatchingProductDB(pedalName, condition);
}

// ── In-memory matching (fast path) ──────────────────────────────────
async function findMatchingProductCached(pedalName) {
  const normalized = normalizePedalName(pedalName);
  const normalizedLower = normalized.toLowerCase();
  const searchTerms = normalized.split(" ").filter((t) => t.length > 0);
  const searchTermsMinLen2 = normalized.split(" ").filter((t) => t.length > 1);

  const digitTerms = searchTerms.filter((t) => /^\d+$/.test(t));
  const distinctiveTerms = getDistinctiveTerms(searchTermsMinLen2).map((t) => t.toLowerCase());
  const modelCodeTerms = getModelCodeTerms(searchTerms);

  // 1. Exact match
  const exact = cache.exactMatch(normalizedLower);
  if (exact) return cache.getFullProduct(exact._id);

  // Helper: among candidates that pass filters, prefer the closest match.
  // Score (lower is better):
  //   - -10 per query distinctive term that appears as a whole word in title
  //   - -3 × longest contiguous span (k≥2) of query terms appearing in the title
  //     (so "electro harmonix soul food transparent" → "Soul Food Overdrive" beats "Bass Soul Food":
  //      the former has a 4-word contiguous match, the latter only 2)
  //   - +1 per extra word in title beyond the query length
  //   - +5 per variant modifier word (Mini, Lil, Anniversary, etc.) the user didn't ask for
  // Popularity breaks ties via the input order (already sorted by count desc).
  const queryWordCount = searchTerms.length;
  const querySet = new Set(searchTerms.map((t) => t.toLowerCase()));
  const queryLower = searchTerms.map((t) => t.toLowerCase());
  const queryDistinctiveLower = distinctiveTerms.map((t) => t.toLowerCase());
  const VARIANT_PENALTY = 5;
  const CONTIGUOUS_PER_WORD = 3;
  const QUERY_MATCH_REWARD = 10;
  const longestContiguousMatch = (title) => {
    for (let k = queryLower.length; k >= 2; k--) {
      for (let i = 0; i <= queryLower.length - k; i++) {
        if (title.includes(queryLower.slice(i, i + k).join(" "))) return k;
      }
    }
    return 0;
  };
  const pickBestCandidate = (candidates) => {
    let best = null;
    let bestScore = Infinity;
    for (const c of candidates) {
      if (!passesFilters(c.title, normalizedLower, distinctiveTerms, modelCodeTerms, digitTerms)) continue;
      const titleWords = c.title.split(" ").filter(Boolean);
      const extra = Math.max(0, titleWords.length - queryWordCount);
      let variantPenalty = 0;
      for (const w of titleWords) {
        if (VARIANT_WORDS.has(w) && !querySet.has(w)) variantPenalty++;
      }
      let queryMatches = 0;
      for (const t of queryDistinctiveLower) {
        if (titleHasWord(c.title, t)) queryMatches++;
      }
      const contiguous = longestContiguousMatch(c.title) * CONTIGUOUS_PER_WORD;
      const score = -queryMatches * QUERY_MATCH_REWARD + extra + variantPenalty * VARIANT_PENALTY - contiguous;
      if (score < bestScore) {
        bestScore = score;
        best = c;
      }
    }
    return best;
  };

  // 2. Fuzzy match — all terms present (use terms length > 1 to avoid "3" alone matching many)
  const termsForFuzzy = (searchTermsMinLen2.length > 0 ? searchTermsMinLen2 : searchTerms).map((t) => t.toLowerCase());
  if (termsForFuzzy.length > 0) {
    const candidates = cache.fuzzyMatch(termsForFuzzy, 20);
    const best = pickBestCandidate(candidates);
    if (best) return cache.getFullProduct(best._id);
  }

  // 3. Partial match — try with progressively fewer terms.
  // Start with all important terms (>=3 chars), then drop one at a time until we find candidates.
  // This ensures specific products like "Electro-Harmonix Soul Food" aren't missed when query
  // has 5+ terms but only the first 2 are too generic ("electro", "harmonix").
  if (searchTermsMinLen2.length >= 2) {
    const importantTerms = searchTermsMinLen2.filter((t) => t.length >= 3).map((t) => t.toLowerCase());
    if (importantTerms.length >= 2) {
      for (let n = importantTerms.length; n >= 2; n--) {
        const partialTerms = importantTerms.slice(0, n);
        const candidates = cache.fuzzyMatch(partialTerms, 20);
        const best = pickBestCandidate(candidates);
        if (best) return cache.getFullProduct(best._id);
      }
    }
  }

  // 4. Last resort — only return if confidence is high (most distinctive terms match as whole words).
  // Otherwise, fall through to Claude — substring matches like "lunar" inside "lunareclipse" produce
  // false positives we can't trust.
  const brandTerm = distinctiveTerms.length > 0
    ? distinctiveTerms[0]
    : (searchTerms.find((t) => t.length >= 4) || "").toLowerCase();
  if (brandTerm) {
    const candidates = cache.filterMatch((title) => {
      if (!titleHasWord(title, brandTerm)) return false;
      if (digitTerms.length > 0 && !digitTerms.some((d) => titleHasWord(title, d))) return false;
      return true;
    }, 50);

    let best = null;
    let bestScore = -1;
    for (const c of candidates) {
      if (!filterNonPedalCandidate(c.title, normalizedLower)) continue;
      if (!productHasModelCode(c.title, modelCodeTerms)) continue;
      // Score by number of distinctive terms appearing as whole words (not substrings)
      const score = distinctiveTerms.filter((t) => titleHasWord(c.title, t)).length;
      if (score > bestScore) {
        bestScore = score;
        best = c;
      }
    }
    // Require at least 2 whole-word distinctive matches.
    // Single-word vague queries (like "Prototype" alone) fall through to Claude — too risky to guess.
    const minRequired = Math.max(2, Math.ceil(distinctiveTerms.length / 2));
    if (best && distinctiveTerms.length >= 2 && bestScore >= minRequired) {
      return cache.getFullProduct(best._id);
    }
    // Otherwise fall through to Claude
  }

  // 5. AI fallback — ask Claude to pick from top candidates when string matching fails
  try {
    const aiMatch = await findMatchWithClaude(pedalName, normalized);
    if (aiMatch) return aiMatch;
  } catch (err) {
    console.error("[matching] AI fallback failed:", err?.message || err);
  }

  return null;
}

// ── DB fallback (original logic, used before cache is ready) ────────
async function findMatchingProductDB(pedalName, condition = null) {
  const normalized = normalizePedalName(pedalName);
  const searchTerms = normalized.split(" ").filter((t) => t.length > 0);
  const searchTermsMinLen2 = normalized.split(" ").filter((t) => t.length > 1);

  const digitTerms = searchTerms.filter((t) => /^\d+$/.test(t));
  const distinctiveTerms = getDistinctiveTerms(searchTermsMinLen2);
  const modelCodeTerms = getModelCodeTerms(searchTerms);

  // Try exact match first
  let product = await Product.findOne({
    normalizedTitle: normalized,
    hasPriceGuide: true,
  });

  if (product) return product;

  // Try fuzzy match using search terms (all terms must be present)
  const termsForFuzzy = searchTermsMinLen2.length > 0 ? searchTermsMinLen2 : searchTerms;
  if (termsForFuzzy.length > 0) {
    const regexPattern = termsForFuzzy.map((term) => `(?=.*${escapeRegex(term)})`).join("");
    const candidates = await Product.find({
      normalizedTitle: { $regex: regexPattern, $options: "i" },
      hasPriceGuide: true,
    }).sort({ "priceGuideSummary.all.count": -1 }).limit(20).lean();

    for (const c of candidates) {
      if (!filterNonPedalCandidate(c.normalizedTitle, normalized)) continue;
      if (!productHasDistinctiveTerm((c.normalizedTitle || "").toLowerCase(), distinctiveTerms.map((t) => t.toLowerCase()))) continue;
      if (!productHasModelCode((c.normalizedTitle || "").toLowerCase(), modelCodeTerms)) continue;
      if (digitTerms.length > 0) {
        const title = (c.normalizedTitle || "").toLowerCase();
        if (!digitTerms.some((d) => title.includes(d))) continue;
      }
      return c;
    }
  }

  // Try partial match
  if (searchTermsMinLen2.length >= 2) {
    const importantTerms = searchTermsMinLen2.filter((t) => t.length >= 3);
    if (importantTerms.length >= 2) {
      const partialPattern = importantTerms.slice(0, 2).map((term) => `(?=.*${escapeRegex(term)})`).join("");
      const candidates = await Product.find({
        normalizedTitle: { $regex: partialPattern, $options: "i" },
        hasPriceGuide: true,
      }).sort({ "priceGuideSummary.all.count": -1 }).limit(20).lean();

      for (const c of candidates) {
        if (!filterNonPedalCandidate(c.normalizedTitle, normalized)) continue;
        if (!productHasDistinctiveTerm((c.normalizedTitle || "").toLowerCase(), distinctiveTerms.map((t) => t.toLowerCase()))) continue;
        if (!productHasModelCode((c.normalizedTitle || "").toLowerCase(), modelCodeTerms)) continue;
        if (digitTerms.length > 0) {
          const title = (c.normalizedTitle || "").toLowerCase();
          if (!digitTerms.some((d) => title.includes(d))) continue;
        }
        return c;
      }
    }
  }

  // Last resort
  const brandTerm = distinctiveTerms.length > 0
    ? distinctiveTerms[0]
    : searchTerms.find((t) => t.length >= 4);
  if (brandTerm) {
    const conditions = [
      { normalizedTitle: { $regex: escapeRegex(brandTerm), $options: "i" } },
      { hasPriceGuide: true },
    ];
    if (digitTerms.length > 0) {
      conditions.push({
        normalizedTitle: { $regex: digitTerms.map((d) => escapeRegex(d)).join("|"), $options: "i" },
      });
    }
    const lastResortCandidates = await Product.find({ $and: conditions })
      .sort({ "priceGuideSummary.all.count": -1 })
      .limit(50)
      .lean();
    let best = null;
    let bestScore = -1;
    for (const c of lastResortCandidates) {
      if (!filterNonPedalCandidate(c.normalizedTitle, normalized)) continue;
      if (!productHasModelCode((c.normalizedTitle || "").toLowerCase(), modelCodeTerms)) continue;
      const title = (c.normalizedTitle || "").toLowerCase();
      const score = distinctiveTerms.filter((t) => title.includes(t.toLowerCase())).length;
      if (score > bestScore) {
        bestScore = score;
        best = c;
      }
    }
    if (best) return best;
  }

  return null;
}

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

module.exports = {
  findMatchingProduct,
};
