const Product = require("../model/product.mdl");
const Calculation = require("../model/calculation.mdl");
const PriceAudit = require("../model/price-audit.mdl");
const { addOneYear } = require("../utils/pricing");
const {
  getActiveBuyPriceRules,
  computeBuyPriceFromRules,
  recomputePersonTotals,
} = require("../utils/buyPriceRules");

async function updateCalculationRowAndTotals({
  calculationId,
  userId,
  personName,
  pedal,
  updateRow,
  recalcTotals = false,
}) {
  if (!calculationId || personName == null || pedal == null) return null;
  const calculation = await Calculation.findOne({ _id: calculationId, userId });
  if (!calculation || !calculation.results || !calculation.results[personName]) return null;

  const personData = calculation.results[personName];
  if (!personData || !Array.isArray(personData.pedals)) return null;
  const row = personData.pedals.find((p) => p.pedal === pedal);
  if (!row) return null;

  const rules = recalcTotals ? await getActiveBuyPriceRules() : null;
  updateRow(row, rules || []);

  if (recalcTotals) {
    recomputePersonTotals(personData, rules || []);
    calculation.totalPrice = Object.values(calculation.results || {}).reduce(
      (sum, p) => sum + (p && Number.isFinite(Number(p.totalPrice)) ? Number(p.totalPrice) : 0),
      0
    );
    calculation.totalOffer = Object.values(calculation.results || {}).reduce(
      (sum, p) => sum + (p && Number.isFinite(Number(p.totalOffer)) ? Number(p.totalOffer) : 0),
      0
    );
  }

  calculation.markModified("results");
  await calculation.save();

  return {
    personName,
    totalPrice: personData.totalPrice,
    totalOffer: personData.totalOffer,
    calculationTotalPrice: calculation.totalPrice,
    calculationTotalOffer: calculation.totalOffer,
  };
}

const updatePtmBuyPrice = async (req, res) => {
  try {
    const { productId } = req.params;
    const { ptmBuyPrice, calculationId, personName, pedal } = req.body;
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

    const computedBuyPrice = newValue != null ? computeBuyPriceFromRules(newValue, await getActiveBuyPriceRules()) : null;
    const calcUpdate = await updateCalculationRowAndTotals({
      calculationId,
      userId: req.session.userId,
      personName,
      pedal,
      recalcTotals: true,
      updateRow: (row) => {
        row.ptmBuyPrice = newValue;
        row.ptmBuyPriceExpiresAt = expiresAt ? expiresAt.toISOString().slice(0, 10) : null;
        row.buyPrice = computedBuyPrice;
      },
    });

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
      buyPrice: computedBuyPrice,
      totals: calcUpdate || undefined,
    });
  } catch (error) {
    console.error("Error in PATCH /api/products/:productId/ptm-buy-price:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

const updatePtmSellPrice = async (req, res) => {
  try {
    const { productId } = req.params;
    const { ptmSellPrice, calculationId, personName, pedal } = req.body;
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

    await updateCalculationRowAndTotals({
      calculationId,
      userId: req.session.userId,
      personName,
      pedal,
      recalcTotals: false,
      updateRow: (row) => {
        row.ptmSellPrice = newValue;
        row.ptmSellPriceExpiresAt = product.ptmSellPriceExpiresAt
          ? product.ptmSellPriceExpiresAt.toISOString().slice(0, 10)
          : null;
      },
    });

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

const updateBuyPrice = async (req, res) => {
  try {
    const { productId } = req.params;
    const { buyPrice, calculationId, personName, pedal } = req.body;
    if (productId === undefined || productId === "") {
      return res.status(400).json({ error: "Product ID is required" });
    }
    const product = await Product.findOne({ canonicalProductId: productId });
    if (!product) {
      return res.status(404).json({ error: "Product not found" });
    }
    const newValue = buyPrice != null && buyPrice !== "" ? Number(buyPrice) : null;
    product.buyPrice = newValue;
    await product.save();

    const calcUpdate = await updateCalculationRowAndTotals({
      calculationId,
      userId: req.session.userId,
      personName,
      pedal,
      recalcTotals: true,
      updateRow: (row) => {
        row.buyPrice = newValue;
      },
    });

    res.json({
      success: true,
      productId: product.canonicalProductId,
      buyPrice: product.buyPrice,
      totals: calcUpdate || undefined,
    });
  } catch (error) {
    console.error("Error in PATCH /api/products/:productId/buy-price:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

module.exports = {
  updatePtmBuyPrice,
  updatePtmSellPrice,
  updateBuyPrice,
};
