const mongoose = require("mongoose");
const { loadProductCache } = require("../services/productCache");

const connectDB = async (mongoUri) => {
  try {
    await mongoose.connect(mongoUri);
    console.log("✅ MongoDB connected:", mongoUri);
    // Load product titles into memory for fast matching (non-blocking)
    loadProductCache().catch((err) =>
      console.error("⚠️  Product cache load failed (falling back to DB queries):", err.message)
    );
  } catch (err) {
    console.error("❌ MongoDB connection error:", err);
    process.exit(1);
  }
};

module.exports = connectDB;
