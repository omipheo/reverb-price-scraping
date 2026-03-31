const { Schema, model } = require("mongoose");

// Log of no match / partial match feedback for improving search
const MatchFeedbackLogSchema = new Schema({
  calculationId: { type: Schema.Types.ObjectId, ref: "Calculation", index: true },
  userId: { type: Schema.Types.ObjectId, ref: "User", index: true },
  pedal: { type: String, default: "" }, // user input / row pedal name
  personName: { type: String, default: "" },
  productId: { type: String, default: "" }, // canonicalProductId if any
  noMatch: { type: Boolean, default: false },
  partialMatch: { type: Boolean, default: false },
  matchNotes: { type: String, default: "" }, // "What matched & what didn't?" free-text notes
  createdAt: { type: Date, default: Date.now, index: true },
}, { strict: true });

module.exports = model("MatchFeedbackLog", MatchFeedbackLogSchema);
