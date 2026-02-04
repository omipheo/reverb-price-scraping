const { Schema, model } = require("mongoose");

const PriceAuditSchema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
  productId: { type: String, required: true, index: true },
  field: { type: String, required: true },
  oldValue: { type: Schema.Types.Mixed },
  newValue: { type: Schema.Types.Mixed },
  createdAt: { type: Date, default: Date.now, index: true },
});

module.exports = model("PriceAudit", PriceAuditSchema);
