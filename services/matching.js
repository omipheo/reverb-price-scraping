const Product = require("../model/product.mdl");
const { normalizePedalName } = require("../utils/normalization");

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
function filterNonPedalCandidate(product, normalizedQuery) {
  if (!product || !product.normalizedTitle) return true;
  if (queryImpliesNonPedal(normalizedQuery)) return false; // keep
  return !productLooksLikeNonPedal(product.normalizedTitle);
}

// Generic words that often match unrelated products (e.g. "pink" -> Roto Pinks strings). If query has
// distinctive terms (brand/model), require product to contain at least one so "Light Pink Keeley Katana" matches Keeley pedal not strings.
const GENERIC_WORDS = new Set([
  "light", "pink", "blue", "red", "black", "white", "green", "orange", "yellow", "grey", "gray",
  "mini", "micro", "standard", "v1", "v2", "mk", "mki", "mkii", "usa", "us", "uk", "ii", "iii",
  "pedal", "pedals", "guitar", "bass", "amp", "box", "new", "old", "pro", "full", "small", "big",
]);
function getDistinctiveTerms(searchTerms) {
  return searchTerms.filter((t) => t.length >= 2 && !GENERIC_WORDS.has(t.toLowerCase()));
}
// Require product to contain at least one distinctive term when query has multiple terms and at least one is distinctive
function productHasDistinctiveTerm(product, distinctiveTerms) {
  if (!distinctiveTerms.length || !product?.normalizedTitle) return true;
  const title = product.normalizedTitle.toLowerCase();
  return distinctiveTerms.some((term) => title.includes(term.toLowerCase()));
}

// 2-letter model codes (e.g. "ce" in CE-20, "re" in RE-20). Require product to contain as a word so "Boss CE-20" doesn't match "Boss RE-20" (RE-20 has "ce" inside "space").
const TWO_LETTER_SKIP = new Set(["us", "uk", "ii", "mk", "v1", "v2"]); // avoid requiring these as model codes
function getModelCodeTerms(searchTerms) {
  return searchTerms.filter((t) => /^[a-z]{2}$/i.test(t) && !TWO_LETTER_SKIP.has(t.toLowerCase()));
}
// Code must appear as a word (not inside "space" or "piece") so CE-20 doesn't match RE-20 Space Echo
function productHasModelCode(product, modelCodeTerms) {
  if (!modelCodeTerms.length || !product?.normalizedTitle) return true;
  const title = product.normalizedTitle.toLowerCase();
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

// Utility: Find best matching product in MongoDB
async function findMatchingProduct(pedalName, condition = null) {
  const normalized = normalizePedalName(pedalName);
  const searchTerms = normalized.split(" ").filter((t) => t.length > 0); // keep short terms for model numbers (e.g. "3", "ph")
  const searchTermsMinLen2 = normalized.split(" ").filter((t) => t.length > 1);

  // Digits in query (e.g. "3" in "Boss PH-3") must appear in product title to avoid PH-2 matching PH-3
  const digitTerms = searchTerms.filter((t) => /^\d+$/.test(t));
  const distinctiveTerms = getDistinctiveTerms(searchTermsMinLen2);
  const modelCodeTerms = getModelCodeTerms(searchTerms);

  // Try exact match first
  let product = await Product.findOne({
    normalizedTitle: normalized,
    hasPriceGuide: true,
  });

  if (product) return product;

  // Try fuzzy match using search terms (all terms must be present); use terms length > 1 to avoid "3" alone matching many
  const termsForFuzzy = searchTermsMinLen2.length > 0 ? searchTermsMinLen2 : searchTerms;
  if (termsForFuzzy.length > 0) {
    const regexPattern = termsForFuzzy.map((term) => `(?=.*${escapeRegex(term)})`).join("");
    const candidates = await Product.find({
      normalizedTitle: { $regex: regexPattern, $options: "i" },
      hasPriceGuide: true,
    }).sort({ "priceGuideSummary.all.count": -1 }).limit(20).lean();

    for (const c of candidates) {
      if (!filterNonPedalCandidate(c, normalized)) continue;
      if (!productHasDistinctiveTerm(c, distinctiveTerms)) continue;
      if (!productHasModelCode(c, modelCodeTerms)) continue;
      if (digitTerms.length > 0) {
        const title = (c.normalizedTitle || "").toLowerCase();
        if (!digitTerms.some((d) => title.includes(d))) continue;
      }
      return c;
    }
  }

  // Try partial match - at least 2 key terms must match (for cases like "ts-9" vs "ts9")
  if (searchTermsMinLen2.length >= 2) {
    const importantTerms = searchTermsMinLen2.filter((t) => t.length >= 3);
    if (importantTerms.length >= 2) {
      const partialPattern = importantTerms.slice(0, 2).map((term) => `(?=.*${escapeRegex(term)})`).join("");
      const candidates = await Product.find({
        normalizedTitle: { $regex: partialPattern, $options: "i" },
        hasPriceGuide: true,
      }).sort({ "priceGuideSummary.all.count": -1 }).limit(20).lean();

      for (const c of candidates) {
        if (!filterNonPedalCandidate(c, normalized)) continue;
        if (!productHasDistinctiveTerm(c, distinctiveTerms)) continue;
        if (!productHasModelCode(c, modelCodeTerms)) continue;
        if (digitTerms.length > 0) {
          const title = (c.normalizedTitle || "").toLowerCase();
          if (!digitTerms.some((d) => title.includes(d))) continue;
        }
        return c;
      }
    }
  }

  // Last resort: use distinctive term first (e.g. "keeley") so "Light Pink Keeley Katana" doesn't match "Light Gain" products
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
      if (!filterNonPedalCandidate(c, normalized)) continue;
      if (!productHasModelCode(c, modelCodeTerms)) continue;
      // Prefer product that contains more distinctive terms (e.g. "Keeley Katana" over "Keeley Omni Reverb" for "Light Pink Keeley Katana")
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
