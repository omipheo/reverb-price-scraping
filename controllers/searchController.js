const Calculation = require("../model/calculation.mdl");
const { findMatchingProduct } = require("../services/matching");
const { calculatePriceFromTransactions, calculateOffer, calculatePtmSellPrice } = require("../utils/pricing");
const { buildReverbPgLink } = require("../utils/reverb");

const searchPedals = async (req, res) => {
  try {
    const { pedals } = req.body;

    if (!pedals || !Array.isArray(pedals)) {
      return res.status(400).json({ error: "Pedals array is required" });
    }

    const results = [];

    for (const pedal of pedals) {
      const pedalName = typeof pedal === "string" ? pedal : pedal.name || "";
      const condition =
        typeof pedal === "object" ? pedal.condition : null;

      const product = await findMatchingProduct(pedalName, condition);

      if (product) {
        const price = calculatePriceFromTransactions(product, condition);
        const reverbPgHistPrice = price;
        const reverbPgLink = buildReverbPgLink(product);
        // Reverb Market Sold: only from marketplace-sold scrape (blank until that scrape runs)
        const reverbMarketSoldPrice = product.reverbMarketSoldPrice ?? null;
        const reverbMarketSoldLink = product.reverbMarketSoldLink ?? null;
        const ptmBuyPrice = product.ptmBuyPrice != null ? product.ptmBuyPrice : null;
        const ptmBuyPriceExpiresAt = product.ptmBuyPriceExpiresAt || null;
        const expStr = ptmBuyPriceExpiresAt ? (ptmBuyPriceExpiresAt.toISOString ? ptmBuyPriceExpiresAt.toISOString().slice(0, 10) : ptmBuyPriceExpiresAt) : null;
        const ptmSellPrice = product.ptmSellPrice != null ? product.ptmSellPrice : calculatePtmSellPrice(product);
        const ptmSellPriceExpiresAt = product.ptmSellPriceExpiresAt || null;
        const sellExpStr = ptmSellPriceExpiresAt ? (ptmSellPriceExpiresAt.toISOString ? ptmSellPriceExpiresAt.toISOString().slice(0, 10) : ptmSellPriceExpiresAt) : null;

        if (price !== null) {
          const offer = calculateOffer(price);

          results.push({
            pedalName,
            condition: condition || "Unknown",
            matchedProduct: product.title,
            brand: product.brand,
            price,
            offer,
            hasPriceGuide: true,
            productId: product.canonicalProductId,
            reverbPgHistPrice,
            reverbPgLink,
            reverbMarketSoldPrice,
            reverbMarketSoldLink,
            amtListedOnReverbMarket: null,
            ptmBuyPrice,
            ptmBuyPriceExpiresAt: expStr,
            ptmSellPrice,
            ptmSellPriceExpiresAt: sellExpStr,
            noMatch: false,
            partialMatch: false,
          });
        } else {
          results.push({
            pedalName,
            condition: condition || "Unknown",
            matchedProduct: product.title,
            brand: product.brand,
            price: null,
            offer: 0,
            hasPriceGuide: false,
            productId: product.canonicalProductId,
            reverbPgHistPrice: null,
            reverbPgLink,
            reverbMarketSoldPrice,
            reverbMarketSoldLink,
            amtListedOnReverbMarket: null,
            ptmBuyPrice,
            ptmBuyPriceExpiresAt: expStr,
            ptmSellPrice,
            ptmSellPriceExpiresAt: sellExpStr,
            noMatch: false,
            partialMatch: false,
          });
        }
      } else {
        results.push({
          pedalName,
          condition: condition || "Unknown",
          matchedProduct: null,
          brand: null,
          price: null,
          offer: 0,
          hasPriceGuide: false,
          productId: null,
          reverbPgHistPrice: null,
          reverbPgLink: null,
          reverbMarketSoldPrice: null,
          reverbMarketSoldLink: null,
          amtListedOnReverbMarket: null,
          ptmBuyPrice: null,
          ptmBuyPriceExpiresAt: null,
          ptmSellPrice: null,
          ptmSellPriceExpiresAt: null,
          noMatch: false,
          partialMatch: false,
        });
      }
    }

    // Sort by price (lowest to highest)
    results.sort((a, b) => {
      if (!a.price && !b.price) return 0;
      if (!a.price) return 1;
      if (!b.price) return -1;
      return a.price - b.price;
    });

    // FMV = sum of PTM Buy Prices only (client requirement)
    const totalPrice = results.reduce((sum, r) => sum + (r.ptmBuyPrice != null ? r.ptmBuyPrice : 0), 0);
    const totalOffer = calculateOffer(totalPrice);

    // Format results for display (convert array to object format)
    const formattedResults = {
      "All Pedals": {
        pedals: results.map(r => ({
          pedal: r.pedalName,
          condition: r.condition,
          matchedProduct: r.matchedProduct,
          brand: r.brand,
          price: r.price,
          offer: r.offer,
          hasPriceGuide: r.hasPriceGuide,
          reverbPgHistPrice: r.reverbPgHistPrice,
          reverbPgLink: r.reverbPgLink,
          reverbMarketSoldPrice: r.reverbMarketSoldPrice,
          reverbMarketSoldLink: r.reverbMarketSoldLink,
          amtListedOnReverbMarket: r.amtListedOnReverbMarket,
          ptmBuyPrice: r.ptmBuyPrice,
          ptmBuyPriceExpiresAt: r.ptmBuyPriceExpiresAt,
          productId: r.productId,
          ptmSellPrice: r.ptmSellPrice,
          ptmSellPriceExpiresAt: r.ptmSellPriceExpiresAt,
          noMatch: r.noMatch || false,
          partialMatch: r.partialMatch || false,
        })),
        totalPrice,
        totalOffer,
      }
    };

    // Save calculation to database (save in the format that displayResults expects)
    const calculation = new Calculation({
      userId: req.session.userId,
      title: req.body.title || `Calculation ${new Date().toLocaleString()}`,
      inputType: "text",
      inputData: { pedals },
      results: formattedResults, // Save in object format
      totalPrice,
      totalOffer,
    });
    await calculation.save();

    res.json({ 
      results: formattedResults, // Return in object format
      calculationId: calculation._id,
      totalPrice,
      totalOffer,
    });
  } catch (error) {
    console.error("Error in /api/search:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

module.exports = {
  searchPedals,
};
