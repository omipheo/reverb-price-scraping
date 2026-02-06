const UserPedal = require("../model/user-pedal.mdl");
const { normalizePedalName } = require("../utils/normalization");
const { addOneYear } = require("../utils/pricing");

const createPedal = async (req, res) => {
  try {
    const { title, ptmBuyPrice } = req.body;
    if (!title || typeof title !== "string" || !title.trim()) {
      return res.status(400).json({ error: "Pedal name (title) is required" });
    }
    const normalized = normalizePedalName(title.trim());
    const now = new Date();
    const expiresAt = ptmBuyPrice != null && Number(ptmBuyPrice) > 0 ? addOneYear(now) : null;
    const price = ptmBuyPrice != null ? Number(ptmBuyPrice) : null;
    const pedal = new UserPedal({
      title: title.trim(),
      normalizedTitle: normalized,
      ptmBuyPrice: price,
      ptmBuyPriceExpiresAt: expiresAt,
      userId: req.session.userId,
    });
    await pedal.save();
    res.status(201).json({
      success: true,
      pedal: {
        id: pedal._id,
        title: pedal.title,
        ptmBuyPrice: pedal.ptmBuyPrice,
        ptmBuyPriceExpiresAt: pedal.ptmBuyPriceExpiresAt,
      },
    });
  } catch (error) {
    console.error("Error in POST /api/pedals:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

const updatePtmBuyPrice = async (req, res) => {
  try {
    const { id } = req.params;
    const { ptmBuyPrice } = req.body;
    const pedal = await UserPedal.findOne({ _id: id, userId: req.session.userId });
    if (!pedal) {
      return res.status(404).json({ error: "Pedal not found" });
    }
    const now = new Date();
    const expiresAt = ptmBuyPrice != null && Number(ptmBuyPrice) > 0 ? addOneYear(now) : null;
    pedal.ptmBuyPrice = ptmBuyPrice != null ? Number(ptmBuyPrice) : null;
    pedal.ptmBuyPriceExpiresAt = expiresAt;
    await pedal.save();
    res.json({
      success: true,
      pedal: {
        id: pedal._id,
        title: pedal.title,
        ptmBuyPrice: pedal.ptmBuyPrice,
        ptmBuyPriceExpiresAt: pedal.ptmBuyPriceExpiresAt,
      },
    });
  } catch (error) {
    console.error("Error in PATCH /api/pedals/:id/ptm-buy-price:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

module.exports = {
  createPedal,
  updatePtmBuyPrice,
};
