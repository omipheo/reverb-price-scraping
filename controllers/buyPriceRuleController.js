const BuyPriceRuleConfig = require("../model/buy-price-rule-config.mdl");
const { DEFAULT_BUY_PRICE_RULES } = require("../utils/buyPriceRules");

function toNumOrNull(v) {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : NaN;
}

function sanitizeRules(rawRules) {
  if (!Array.isArray(rawRules)) return [];
  return rawRules.map((r) => {
    const mode = r && r.mode === "subtract" ? "subtract" : "percent";
    return {
      minFmv: toNumOrNull(r ? r.minFmv : null),
      maxFmv: toNumOrNull(r ? r.maxFmv : null),
      mode,
      value: Number(r ? r.value : NaN),
    };
  });
}

function validateRules(rules) {
  if (!Array.isArray(rules) || rules.length < 1) {
    return "At least one rule is required";
  }

  for (let i = 0; i < rules.length; i++) {
    const r = rules[i];
    if (!Number.isFinite(r.value) || r.value < 0) {
      return `Rule ${i + 1}: value must be a non-negative number`;
    }
    if (r.mode === "percent" && r.value > 100) {
      return `Rule ${i + 1}: percent reduction must be <= 100`;
    }

    const isFirst = i === 0;
    const isLast = i === rules.length - 1;

    if (isFirst && r.minFmv != null) {
      return "First rule must have no minimum (blank min)";
    }
    if (isLast && r.maxFmv != null) {
      return "Last rule must have no maximum (blank max)";
    }

    if (!isFirst && !Number.isFinite(r.minFmv)) {
      return `Rule ${i + 1}: min FMV is required`;
    }
    if (!isLast && !Number.isFinite(r.maxFmv)) {
      return `Rule ${i + 1}: max FMV is required`;
    }
    if (Number.isFinite(r.minFmv) && Number.isFinite(r.maxFmv) && r.minFmv >= r.maxFmv) {
      return `Rule ${i + 1}: min FMV must be less than max FMV`;
    }
  }

  for (let i = 1; i < rules.length; i++) {
    const prev = rules[i - 1];
    const curr = rules[i];
    if (Number.isFinite(prev.maxFmv) && Number.isFinite(curr.minFmv) && curr.minFmv < prev.maxFmv) {
      return `Rule ${i + 1}: min FMV overlaps previous rule`;
    }
  }

  return null;
}

async function getEffectiveRulesDoc() {
  const doc = await BuyPriceRuleConfig.findOne({ key: "default" });
  if (doc && Array.isArray(doc.rules) && doc.rules.length > 0) {
    return doc;
  }
  const created = await BuyPriceRuleConfig.findOneAndUpdate(
    { key: "default" },
    { $setOnInsert: { rules: DEFAULT_BUY_PRICE_RULES, updatedAt: new Date() } },
    { new: true, upsert: true }
  );
  return created;
}

// GET /api/buy-price-rules
const getBuyPriceRules = async (_req, res) => {
  try {
    const doc = await getEffectiveRulesDoc();
    res.json({ success: true, rules: doc.rules || DEFAULT_BUY_PRICE_RULES });
  } catch (error) {
    console.error("Error in GET /api/buy-price-rules:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

// PATCH /api/admin/buy-price-rules
const updateBuyPriceRules = async (req, res) => {
  try {
    const sanitized = sanitizeRules(req.body && req.body.rules);
    const err = validateRules(sanitized);
    if (err) return res.status(400).json({ error: err });

    const doc = await BuyPriceRuleConfig.findOneAndUpdate(
      { key: "default" },
      {
        $set: {
          rules: sanitized,
          updatedBy: req.session.userId || null,
          updatedAt: new Date(),
        },
      },
      { upsert: true, new: true }
    );

    res.json({ success: true, rules: doc.rules || [] });
  } catch (error) {
    console.error("Error in PATCH /api/admin/buy-price-rules:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

module.exports = {
  getBuyPriceRules,
  updateBuyPriceRules,
  DEFAULT_BUY_PRICE_RULES,
};

