const Product = require("../model/product.mdl");
const PriceAudit = require("../model/price-audit.mdl");
const { addOneYear } = require("../utils/pricing");

const updatePtmBuyPrice = async (req, res) => {
  try {
    const { productId } = req.params;
    const { ptmBuyPrice } = req.body;
    if (productId === undefined || productId === "") {
      return res.status(400).json({ error: "Product ID is required" });
    }
    const product = await Product.findOne({ canonicalProductId: productId });
    if (!product) {
      return res.status(404).json({ error: "Product not found" });
    }
    const oldValue = product.ptmBuyPrice;
    const newValue = ptmBuyPrice != null ? Number(ptmBuyPrice) : null;
    const now = new Date();
    const expiresAt = newValue != null ? addOneYear(now) : null;
    product.ptmBuyPrice = newValue;
    product.ptmBuyPriceExpiresAt = expiresAt;
    await product.save();
    await PriceAudit.create({
      userId: req.session.userId,
      productId: product.canonicalProductId,
      field: "ptmBuyPrice",
      oldValue,
      newValue,
    });
    res.json({
      success: true,
      productId: product.canonicalProductId,
      ptmBuyPrice: product.ptmBuyPrice,
      ptmBuyPriceExpiresAt: product.ptmBuyPriceExpiresAt ? product.ptmBuyPriceExpiresAt.toISOString().slice(0, 10) : null,
    });
  } catch (error) {
    console.error("Error in PATCH /api/products/:productId/ptm-buy-price:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

const updatePtmSellPrice = async (req, res) => {
  try {
    const { productId } = req.params;
    const { ptmSellPrice } = req.body;
    if (productId === undefined || productId === "") {
      return res.status(400).json({ error: "Product ID is required" });
    }
    const product = await Product.findOne({ canonicalProductId: productId });
    if (!product) {
      return res.status(404).json({ error: "Product not found" });
    }
    const newValue = ptmSellPrice != null ? Number(ptmSellPrice) : null;
    const now = new Date();
    product.ptmSellPrice = newValue;
    product.ptmSellPriceExpiresAt = newValue != null ? addOneYear(now) : null;
    await product.save();
    res.json({
      success: true,
      productId: product.canonicalProductId,
      ptmSellPrice: product.ptmSellPrice,
      ptmSellPriceExpiresAt: product.ptmSellPriceExpiresAt ? product.ptmSellPriceExpiresAt.toISOString().slice(0, 10) : null,
    });
  } catch (error) {
    console.error("Error in PATCH /api/products/:productId/ptm-sell-price:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

module.exports = {
  updatePtmBuyPrice,
  updatePtmSellPrice,
};
