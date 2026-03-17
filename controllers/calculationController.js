const Calculation = require("../model/calculation.mdl");
const Product = require("../model/product.mdl");
const MatchFeedbackLog = require("../model/match-feedback-log.mdl");
const mongoose = require("mongoose");
const { normalizePedalName } = require("../utils/normalization");

/** Find a no-match row (no productId) by personName and pedal name; create a Product and assign it to that row. */
async function ensureProductForNoMatchRow(calculation, personName, pedal) {
  const results = calculation.results;
  if (!results || typeof results !== "object" || !results[personName] || !Array.isArray(results[personName].pedals)) {
    return null;
  }
  const row = results[personName].pedals.find((p) => p.pedal === pedal && (p.productId == null || p.productId === ""));
  if (!row) return null;

  const canonicalProductId = "user-added-" + new mongoose.Types.ObjectId().toHexString();
  const product = new Product({
    canonicalProductId,
    title: pedal || "Unknown",
    normalizedTitle: normalizePedalName(pedal || ""),
    hasPriceGuide: true,
  });
  await product.save();

  row.productId = product.canonicalProductId;
  calculation.results = results;
  await calculation.save();
  return product.canonicalProductId;
}

const getCalculations = async (req, res) => {
  try {
    const calculations = await Calculation.find({ userId: req.session.userId })
      .sort({ createdAt: -1 })
      .limit(50)
      .select("title inputType totalPrice totalOffer createdAt _id");

    res.json({ calculations });
  } catch (error) {
    console.error("Error in /api/calculations:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

const getCalculation = async (req, res) => {
  try {
    const calculation = await Calculation.findOne({
      _id: req.params.id,
      userId: req.session.userId,
    });

    if (!calculation) {
      return res.status(404).json({ error: "Calculation not found" });
    }

    res.json({ calculation });
  } catch (error) {
    console.error("Error in /api/calculations/:id:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

const deleteAllCalculations = async (req, res) => {
  try {
    const result = await Calculation.deleteMany({ userId: req.session.userId });
    res.json({ 
      success: true, 
      deletedCount: result.deletedCount 
    });
  } catch (error) {
    console.error("Error in /api/calculations DELETE:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

const deleteCalculation = async (req, res) => {
  try {
    const result = await Calculation.deleteOne({
      _id: req.params.id,
      userId: req.session.userId,
    });

    if (result.deletedCount === 0) {
      return res.status(404).json({ error: "Calculation not found" });
    }

    res.json({ success: true });
  } catch (error) {
    console.error("Error in /api/calculations/:id DELETE:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

const updatePedalFeedback = async (req, res) => {
  try {
    const { id } = req.params;
    const { productId, noMatch, partialMatch, personName, pedal } = req.body;
    const calculation = await Calculation.findOne({ _id: id, userId: req.session.userId });
    if (!calculation) {
      return res.status(404).json({ error: "Calculation not found" });
    }
    const results = calculation.results;
    if (!results || typeof results !== "object") {
      return res.status(400).json({ error: "No results in calculation" });
    }

    let resolvedProductId = productId;
    if (!resolvedProductId && personName != null && pedal != null) {
      resolvedProductId = await ensureProductForNoMatchRow(calculation, personName, pedal);
      if (!resolvedProductId) {
        return res.status(404).json({ error: "No-match row not found" });
      }
      const row = calculation.results[personName].pedals.find((p) => p.pedal === pedal);
      if (row) {
        row.noMatch = !!noMatch;
        row.partialMatch = !!partialMatch;
        await calculation.save();
      }
      try {
        await MatchFeedbackLog.create({
          calculationId: id,
          userId: req.session.userId,
          pedal,
          personName: personName || "",
          productId: resolvedProductId || "",
          noMatch: !!noMatch,
          partialMatch: !!partialMatch,
        });
      } catch (e) {
        console.error("MatchFeedbackLog create:", e);
      }
      return res.json({ success: true, productId: resolvedProductId });
    }

    let updated = false;
    let updatedPersonName = "";
    let updatedPedal = "";
    for (const personKey of Object.keys(results)) {
      const personData = results[personKey];
      if (!personData || !Array.isArray(personData.pedals)) continue;
      for (const p of personData.pedals) {
        if (p.productId === resolvedProductId) {
          p.noMatch = !!noMatch;
          p.partialMatch = !!partialMatch;
          updatedPersonName = personKey;
          updatedPedal = p.pedal || "";
          updated = true;
          break;
        }
      }
      if (updated) break;
    }
    if (!updated) {
      return res.status(404).json({ error: "Pedal not found in calculation" });
    }
    calculation.results = results;
    await calculation.save();
    try {
      await MatchFeedbackLog.create({
        calculationId: id,
        userId: req.session.userId,
        pedal: updatedPedal,
        personName: updatedPersonName,
        productId: resolvedProductId || "",
        noMatch: !!noMatch,
        partialMatch: !!partialMatch,
      });
    } catch (e) {
      console.error("MatchFeedbackLog create:", e);
    }
    res.json({ success: true });
  } catch (error) {
    console.error("Error in PATCH /api/calculations/:id/pedal-feedback:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

const ensureNoMatchProduct = async (req, res) => {
  try {
    const { id } = req.params;
    const { personName, pedal } = req.body;
    if (personName == null || pedal == null) {
      return res.status(400).json({ error: "personName and pedal are required" });
    }
    const calculation = await Calculation.findOne({ _id: id, userId: req.session.userId });
    if (!calculation) {
      return res.status(404).json({ error: "Calculation not found" });
    }
    const productId = await ensureProductForNoMatchRow(calculation, personName, pedal);
    if (!productId) {
      return res.status(404).json({ error: "No-match row not found for this person and pedal" });
    }
    res.json({ productId });
  } catch (error) {
    console.error("Error in POST /api/calculations/:id/ensure-no-match-product:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

module.exports = {
  getCalculations,
  getCalculation,
  deleteAllCalculations,
  deleteCalculation,
  updatePedalFeedback,
  ensureNoMatchProduct,
};
