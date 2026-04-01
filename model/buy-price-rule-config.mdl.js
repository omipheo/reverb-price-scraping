const { Schema, model } = require("mongoose");

const BuyPriceRuleSchema = new Schema(
  {
    minFmv: { type: Number, default: null }, // inclusive; null means no lower bound
    maxFmv: { type: Number, default: null }, // exclusive; null means no upper bound
    mode: { type: String, enum: ["subtract", "percent"], default: "percent" },
    value: { type: Number, required: true }, // subtract amount OR reduction percent
  },
  { _id: false, strict: true }
);

const BuyPriceRuleConfigSchema = new Schema(
  {
    key: { type: String, required: true, unique: true, default: "default" },
    rules: { type: [BuyPriceRuleSchema], default: [] },
    updatedBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
    updatedAt: { type: Date, default: Date.now },
  },
  { strict: true }
);

module.exports = model("BuyPriceRuleConfig", BuyPriceRuleConfigSchema);

