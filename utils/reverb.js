// Reverb GraphQL API (same as scripts/scrape-monthly.js)
const GQL_URL = "https://gql.reverb.com/graphql";
const REVERB_GQL_HEADERS = {
  "Content-Type": "application/json",
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  Accept: "application/json",
  Origin: "https://reverb.com",
  Referer: "https://reverb.com/",
};

// Build query string for Reverb URLs: prefer slug, else brand + title
function reverbQueryFromProduct(product) {
  if (!product) return null;
  if (product.slug && product.slug.trim()) {
    return product.slug.trim().replace(/-/g, "+");
  }
  const brand = (product.brand || "").trim();
  const title = (product.title || "").trim();
  const combined = [brand, title].filter(Boolean).join(" ");
  if (!combined) return null;
  return combined.replace(/\s+/g, "+");
}

// Helper: build Reverb Price Guide link.
// Prefer the product page (e.g. reverb.com/p/xotic-sp-compressor#price-guide) when we have a slug.
// Fall back to the price-guide search page only when no slug exists.
function buildReverbPgLink(product) {
  if (!product) return null;
  const slug = (product.slug || "").trim();
  if (slug) {
    return `https://reverb.com/p/${encodeURIComponent(slug)}#price-guide`;
  }
  const query = reverbQueryFromProduct(product);
  if (!query) return null;
  return `https://reverb.com/price-guide?query=${encodeURIComponent(query).replace(/%20/g, "+")}`;
}

// Helper: build Reverb Marketplace Sold listings link (from slug or brand + name)
function buildReverbMarketSoldLink(product) {
  const query = reverbQueryFromProduct(product);
  if (!query) return null;
  const make = (product.brand || "").toLowerCase().trim().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
  const base = `https://reverb.com/marketplace?query=${encodeURIComponent(query).replace(/%20/g, "+")}&show_only_sold=true`;
  return make ? `${base}&make=${encodeURIComponent(make)}&product_type=effects-and-pedals` : base;
}

// Helper: 2nd lowest price from price guide (historical/sold data). Client: "use the 2nd lowest historical price".
function get2ndLowestFromPriceGuide(product) {
  if (!product || !product.priceGuide || product.priceGuide.length < 2) return null;
  const amounts = product.priceGuide
    .map((t) => t.amount)
    .filter(Number.isFinite);
  if (amounts.length < 2) return null;
  const sorted = [...amounts].sort((a, b) => a - b);
  return sorted[1];
}

module.exports = {
  GQL_URL,
  REVERB_GQL_HEADERS,
  buildReverbPgLink,
  buildReverbMarketSoldLink,
  get2ndLowestFromPriceGuide,
};
