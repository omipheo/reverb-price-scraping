const { Schema, model } = require("mongoose");

// User-added pedal (not from Reverb scrape). No priceGuide; optional PTM Buy Price.
const UserPedalSchema = new Schema({
  title: { type: String, required: true },
  normalizedTitle: { type: String, required: true, index: true },
  ptmBuyPrice: { type: Number, default: null },
  ptmBuyPriceExpiresAt: { type: Date, default: null },
  userId: { type: Schema.Types.ObjectId, ref: "User", index: true },
  createdAt: { type: Date, default: Date.now },
});

module.exports = model("UserPedal", UserPedalSchema);
