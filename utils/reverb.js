// Helper: build Reverb Price Guide link (working format: query param)
function buildReverbPgLink(product) {
  if (!product || !product.slug) return null;
  const query = product.slug.replace(/-/g, "+");
  return `https://reverb.com/price-guide?query=${query}`;
}

// Helper: build Reverb Marketplace Sold listings link (for Reverb Market Sold link)
function buildReverbMarketSoldLink(product) {
  if (!product || !product.slug) return null;
  const query = product.slug.replace(/-/g, "+");
  return `https://reverb.com/marketplace?query=${query}&show_only_sold=true`;
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
  buildReverbPgLink,
  buildReverbMarketSoldLink,
  get2ndLowestFromPriceGuide,
};
