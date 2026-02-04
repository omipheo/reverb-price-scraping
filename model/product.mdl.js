const { Schema, model } = require("mongoose");

const SummarySchema = new Schema(
  {
    currency: { type: String, default: "USD" },
    count: { type: Number, default: 0 },
    median: { type: Number, default: 0 },
    average: { type: Number, default: 0 },
    low: { type: Number, default: 0 },
    high: { type: Number, default: 0 },
    lastSoldAt: { type: Number, default: 0 }, // unix seconds
  },
  { _id: false }
);

const ProductSchema = new Schema({
  canonicalProductId: { type: String, unique: true, index: true },

  title: { type: String, default: "" },
  brand: { type: String, default: "" },
  slug: { type: String, default: "" },
  normalizedTitle: { type: String, index: true, default: "" },

  hasPriceGuide: { type: Boolean, default: false, index: true },

  // optional raw transactions (bounded)
  priceGuide: [
    {
      _id: String,
      condition: String,
      amount: Number,
      listingId: String,
      createdAt: Number, // unix seconds
    },
  ],

  // fast lookup
  priceGuideSummary: {
    all: { type: SummarySchema, default: () => ({}) },
    byCondition: { type: Map, of: SummarySchema, default: {} },
    lastUpdated: { type: Date, default: Date.now },
  },

  // PTM Buy Price (editable by user; 1-year expiration from set/update)
  ptmBuyPrice: { type: Number, default: null },
  ptmBuyPriceExpiresAt: { type: Date, default: null },

  // PTM Sell Price (calculated; user can override; expiration only when user overrides)
  ptmSellPrice: { type: Number, default: null },
  ptmSellPriceExpiresAt: { type: Date, default: null },

  createdAt: { type: Date, default: Date.now },
});

module.exports = model("Product", ProductSchema);
