const Calculation = require("../model/calculation.mdl");

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
    const { productId, noMatch, partialMatch } = req.body;
    const calculation = await Calculation.findOne({ _id: id, userId: req.session.userId });
    if (!calculation) {
      return res.status(404).json({ error: "Calculation not found" });
    }
    const results = calculation.results;
    if (!results || typeof results !== "object") {
      return res.status(400).json({ error: "No results in calculation" });
    }
    let updated = false;
    for (const personKey of Object.keys(results)) {
      const personData = results[personKey];
      if (!personData || !Array.isArray(personData.pedals)) continue;
      for (const p of personData.pedals) {
        if (p.productId === productId) {
          p.noMatch = !!noMatch;
          p.partialMatch = !!partialMatch;
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
    res.json({ success: true });
  } catch (error) {
    console.error("Error in PATCH /api/calculations/:id/pedal-feedback:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

module.exports = {
  getCalculations,
  getCalculation,
  deleteAllCalculations,
  deleteCalculation,
  updatePedalFeedback,
};
