const Product = require("../model/product.mdl");

// Lightweight in-memory index of all products with price guides.
// Each entry: { _id, normalizedTitle (lowercased), count (for sort ranking) }
// ~94K entries × ~120 bytes ≈ 11 MB — well within server memory.

let _cache = [];       // sorted by count descending
let _exactMap = null;  // Map<normalizedTitle, index into _cache>
let _ready = false;

async function loadProductCache() {
  const docs = await Product.find(
    { hasPriceGuide: true },
    { _id: 1, normalizedTitle: 1, "priceGuideSummary.all.count": 1 }
  ).lean();

  // Pre-lowercase titles once; sort by count desc (mirrors the DB sort)
  _cache = docs.map((d) => ({
    _id: d._id,
    title: (d.normalizedTitle || "").toLowerCase(),
    count: d.priceGuideSummary?.all?.count || 0,
  }));
  _cache.sort((a, b) => b.count - a.count);

  // Build exact-match lookup
  _exactMap = new Map();
  for (let i = 0; i < _cache.length; i++) {
    const t = _cache[i].title;
    if (t && !_exactMap.has(t)) {
      _exactMap.set(t, i);
    }
  }

  _ready = true;
  console.log(`Product cache loaded: ${_cache.length} entries`);
}

function isReady() {
  return _ready;
}

/** Return the exact-match entry or null */
function exactMatch(normalizedLower) {
  if (!_exactMap) return null;
  const idx = _exactMap.get(normalizedLower);
  return idx !== undefined ? _cache[idx] : null;
}

/**
 * Return candidates whose title contains ALL given terms.
 * Already sorted by count desc. Returns up to `limit` entries.
 */
function fuzzyMatch(terms, limit = 20) {
  const results = [];
  for (const entry of _cache) {
    let match = true;
    for (const term of terms) {
      if (!entry.title.includes(term)) { match = false; break; }
    }
    if (match) {
      results.push(entry);
      if (results.length >= limit) break;
    }
  }
  return results;
}

/**
 * Return candidates matching a custom filter function.
 * Already sorted by count desc. Returns up to `limit` entries.
 */
function filterMatch(filterFn, limit = 50) {
  const results = [];
  for (const entry of _cache) {
    if (filterFn(entry.title)) {
      results.push(entry);
      if (results.length >= limit) break;
    }
  }
  return results;
}

/** Fetch full product document by _id */
async function getFullProduct(id) {
  return Product.findById(id);
}

/**
 * Return top N candidates by popularity (count desc) for AI fallback matching.
 * Filters by whole-word match on any of the given search terms — prevents "kep" matching
 * inside "kep100" so Claude doesn't see misleading wrong-brand candidates.
 */
function topCandidates(searchTerms = [], limit = 30) {
  const results = [];
  const lowered = searchTerms.map((t) => t.toLowerCase()).filter(Boolean);
  const isWordChar = (ch) => /[a-z0-9]/.test(ch);
  const titleHasWord = (title, term) => {
    let idx = title.indexOf(term);
    while (idx !== -1) {
      const before = idx === 0 ? " " : title[idx - 1];
      const after = idx + term.length >= title.length ? " " : title[idx + term.length];
      if (!isWordChar(before) && !isWordChar(after)) return true;
      idx = title.indexOf(term, idx + 1);
    }
    return false;
  };
  for (const entry of _cache) {
    if (lowered.length === 0 || lowered.some((t) => titleHasWord(entry.title, t))) {
      results.push(entry);
      if (results.length >= limit) break;
    }
  }
  return results;
}

module.exports = {
  loadProductCache,
  isReady,
  exactMatch,
  fuzzyMatch,
  filterMatch,
  getFullProduct,
  topCandidates,
};
