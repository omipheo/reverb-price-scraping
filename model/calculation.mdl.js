const { Schema, model } = require("mongoose");

const CalculationSchema = new Schema({
  userId: {
    type: Schema.Types.ObjectId,
    ref: "User",
    required: true,
    index: true,
  },
  title: {
    type: String,
    default: "Untitled Calculation",
  },
  inputType: {
    type: String,
    enum: ["text", "file"],
    required: true,
  },
  inputData: {
    type: Schema.Types.Mixed, // Store original input
  },
  results: {
    type: Schema.Types.Mixed, // Store calculation results
  },
  totalPrice: {
    type: Number,
    default: 0,
  },
  totalOffer: {
    type: Number,
    default: 0,
  },
  createdAt: {
    type: Date,
    default: Date.now,
    index: true,
  },
});

module.exports = model("Calculation", CalculationSchema);
