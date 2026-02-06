const Product = require("../model/product.mdl");
const { normalizePedalName } = require("../utils/normalization");

// Utility: Find best matching product in MongoDB
async function findMatchingProduct(pedalName, condition = null) {
  const normalized = normalizePedalName(pedalName);
  const searchTerms = normalized.split(" ").filter((t) => t.length > 1); // Changed from > 2 to > 1 to include "ts", "9", etc.

  // Try exact match first
  let product = await Product.findOne({
    normalizedTitle: normalized,
    hasPriceGuide: true,
  });

  if (product) return product;

  // Try fuzzy match using search terms (all terms must be present)
  if (searchTerms.length > 0) {
    const regexPattern = searchTerms.map((term) => `(?=.*${term})`).join("");
    product = await Product.findOne({
      normalizedTitle: { $regex: regexPattern, $options: "i" },
      hasPriceGuide: true,
    }).sort({ "priceGuideSummary.all.count": -1 }); // Prefer products with more data

    if (product) return product;
  }

  // Try partial match - at least 2 key terms must match (for cases like "ts-9" vs "ts9")
  if (searchTerms.length >= 2) {
    // Get the most important terms (brand name and model number)
    const importantTerms = searchTerms.filter(t => t.length >= 3); // Brand names and model numbers
    if (importantTerms.length >= 2) {
      const partialPattern = importantTerms.slice(0, 2).map((term) => `(?=.*${term})`).join("");
      product = await Product.findOne({
        normalizedTitle: { $regex: partialPattern, $options: "i" },
        hasPriceGuide: true,
      }).sort({ "priceGuideSummary.all.count": -1 });

      if (product) return product;
    }
  }

  // Last resort: try matching just the brand if available
  const brandTerm = searchTerms.find(t => t.length >= 4); // Likely brand name
  if (brandTerm) {
    product = await Product.findOne({
      $and: [
        { normalizedTitle: { $regex: brandTerm, $options: "i" } },
        { hasPriceGuide: true }
      ]
    }).sort({ "priceGuideSummary.all.count": -1 });
  }

  return product;
}

module.exports = {
  findMatchingProduct,
};
