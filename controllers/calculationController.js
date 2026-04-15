const Calculation = require("../model/calculation.mdl");
const Product = require("../model/product.mdl");
const MatchFeedbackLog = require("../model/match-feedback-log.mdl");
const MatchFeedbackDailyNotification = require("../model/match-feedback-daily-notification.mdl");
const mongoose = require("mongoose");
const { normalizePedalName } = require("../utils/normalization");
const axios = require("axios");

function getDateKeyUTC(d = new Date()) {
  return d.toISOString().slice(0, 10); // YYYY-MM-DD
}

async function maybeSendDailyMatchFeedbackNotification({ now, noMatch, partialMatch, matchNotes }) {
  const matchNotesText = (matchNotes || "").trim();
  const shouldNotify = !!noMatch || !!partialMatch || matchNotesText.length > 0;
  if (!shouldNotify) return;

  const dateKey = getDateKeyUTC(now);

  // Update counters for this day.
  await MatchFeedbackDailyNotification.updateOne(
    { dateKey },
    {
      $inc: {
        totalNoMatch: noMatch ? 1 : 0,
        totalPartialMatch: partialMatch ? 1 : 0,
        totalNotes: matchNotesText.length > 0 ? 1 : 0,
      },
      $setOnInsert: { dateKey, sentAt: null },
    },
    { upsert: true }
  );

  // Atomically set sentAt once so we only notify once/day.
  const gate = await MatchFeedbackDailyNotification.updateOne(
    { dateKey, sentAt: null },
    { $set: { sentAt: now } }
  );

  if (!gate.modifiedCount) return;

  const start = new Date(now);
  start.setUTCHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 1);

  const [totalNew, noMatchCount, partialMatchCount, notesCount, entries] = await Promise.all([
    MatchFeedbackLog.countDocuments({
      createdAt: { $gte: start, $lt: end },
      $or: [
        { noMatch: true },
        { partialMatch: true },
        { matchNotes: { $exists: true, $ne: "" } },
      ],
    }),
    MatchFeedbackLog.countDocuments({ createdAt: { $gte: start, $lt: end }, noMatch: true }),
    MatchFeedbackLog.countDocuments({ createdAt: { $gte: start, $lt: end }, partialMatch: true }),
    MatchFeedbackLog.countDocuments({
      createdAt: { $gte: start, $lt: end },
      matchNotes: { $exists: true, $ne: "" },
    }),
    // Raw feedback entries so the recipient can act on each item directly from the email.
    MatchFeedbackLog.find({
      createdAt: { $gte: start, $lt: end },
      $or: [
        { noMatch: true },
        { partialMatch: true },
        { matchNotes: { $exists: true, $ne: "" } },
      ],
    })
      .sort({ createdAt: 1 })
      .limit(200)
      .select("pedal personName noMatch partialMatch matchNotes createdAt")
      .lean(),
  ]);

  // Build a readable list of feedback rows for the email body
  const formatEntry = (e) => {
    const flags = [];
    if (e.noMatch) flags.push("No Match");
    if (e.partialMatch) flags.push("Partial Match");
    const flagStr = flags.length ? ` [${flags.join(", ")}]` : "";
    const note = (e.matchNotes || "").trim();
    const noteStr = note ? ` — ${note}` : "";
    return `• ${e.pedal || "(unknown)"}${flagStr}${noteStr}`;
  };
  const entriesText = entries.length
    ? entries.map(formatEntry).join("\n")
    : "(no detailed entries)";

  const summary = [
    `Daily match feedback for ${dateKey}.`,
    "",
    `Total New Matches: ${totalNew}`,
    `No Matches: ${noMatchCount}`,
    `Partial Matches: ${partialMatchCount}`,
    `Notes Count: ${notesCount}`,
    "",
    "Details:",
    entriesText,
  ].join("\n");

  const payload = {
    dateKey,
    totalNew,
    noMatchCount,
    partialMatchCount,
    notesCount,
    summary,
    entries, // raw rows (pedal, personName, noMatch, partialMatch, matchNotes, createdAt)
  };

  // Always log so you can see it even without external webhooks.
  console.log("[DailyMatchFeedbackNotification]", payload);

  const webhookUrl = process.env.MATCH_FEEDBACK_DAILY_WEBHOOK_URL;
  if (webhookUrl) {
    try {
      await axios.post(webhookUrl, payload, { timeout: 10000 });
    } catch (e) {
      console.error("DailyMatchFeedback webhook failed:", e?.message || e);
    }
  }
}

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

/** Create a Product for an exact row index if missing, and assign productId to that row. */
async function ensureProductForExactRow(calculation, personName, rowIndex) {
  const results = calculation.results;
  if (
    !results ||
    typeof results !== "object" ||
    !results[personName] ||
    !Array.isArray(results[personName].pedals)
  ) {
    return null;
  }
  if (!Number.isInteger(rowIndex) || rowIndex < 0 || rowIndex >= results[personName].pedals.length) {
    return null;
  }
  const row = results[personName].pedals[rowIndex];
  if (!row) return null;
  if (row.productId) return row.productId;

  const pedal = row.pedal || "Unknown";
  const canonicalProductId = "user-added-" + new mongoose.Types.ObjectId().toHexString();
  const product = new Product({
    canonicalProductId,
    title: pedal,
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
    const { productId, noMatch, partialMatch, personName, pedal, rowIndex, matchNotes } = req.body;
    const matchNotesText = (matchNotes || "").trim();
    const calculation = await Calculation.findOne({ _id: id, userId: req.session.userId });
    if (!calculation) {
      return res.status(404).json({ error: "Calculation not found" });
    }
    const results = calculation.results;
    if (!results || typeof results !== "object") {
      return res.status(400).json({ error: "No results in calculation" });
    }

    let resolvedProductId = productId;

    // 1) Preferred path: update exact row by (personName, rowIndex) when provided.
    let updated = false;
    let updatedPersonName = "";
    let updatedPedal = "";
    const parsedRowIndex = rowIndex != null && Number.isInteger(Number(rowIndex)) ? Number(rowIndex) : null;
    if (
      !updated &&
      personName != null &&
      parsedRowIndex != null &&
      results[personName] &&
      Array.isArray(results[personName].pedals) &&
      parsedRowIndex >= 0 &&
      parsedRowIndex < results[personName].pedals.length
    ) {
      const row = results[personName].pedals[parsedRowIndex];
      if (row) {
        if (!resolvedProductId && (noMatch || partialMatch)) {
          resolvedProductId = await ensureProductForExactRow(calculation, personName, parsedRowIndex);
        }
        row.noMatch = !!noMatch;
        row.partialMatch = !!partialMatch;
        row.matchNotes = matchNotesText;
        updated = true;
        updatedPersonName = personName;
        updatedPedal = row.pedal || pedal || "";
      }
    }

    // 2) Legacy path: update row by (personName, pedal) if provided.
    if (personName != null && pedal != null && results[personName] && Array.isArray(results[personName].pedals)) {
      const row = !updated ? results[personName].pedals.find((p) => p.pedal === pedal) : null;
      if (row) {
        // Only create a permanent Product if the user actually marked no/partial match.
        // Typing notes alone should not create products.
        if (!resolvedProductId && (noMatch || partialMatch)) {
          resolvedProductId = await ensureProductForNoMatchRow(calculation, personName, pedal);
        }

        row.noMatch = !!noMatch;
        row.partialMatch = !!partialMatch;
        row.matchNotes = matchNotesText;
        updated = true;
        updatedPersonName = personName;
        updatedPedal = row.pedal || pedal || "";
      }
    }

    // 3) Fallback: update row by productId.
    if (!updated && resolvedProductId) {
      for (const personKey of Object.keys(results)) {
        const personData = results[personKey];
        if (!personData || !Array.isArray(personData.pedals)) continue;
        for (const p of personData.pedals) {
          if (p.productId === resolvedProductId) {
            p.noMatch = !!noMatch;
            p.partialMatch = !!partialMatch;
            p.matchNotes = matchNotesText;
            updatedPersonName = personKey;
            updatedPedal = p.pedal || "";
            updated = true;
            break;
          }
        }
        if (updated) break;
      }
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
        personName: updatedPersonName || "",
        productId: resolvedProductId || "",
        noMatch: !!noMatch,
        partialMatch: !!partialMatch,
        matchNotes: matchNotesText,
      });
    } catch (e) {
      console.error("MatchFeedbackLog create:", e);
    }

    await maybeSendDailyMatchFeedbackNotification({
      now: new Date(),
      noMatch: !!noMatch,
      partialMatch: !!partialMatch,
      matchNotes: matchNotesText,
    });

    res.json({ success: true, productId: resolvedProductId || undefined });
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
