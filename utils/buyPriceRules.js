const BuyPriceRuleConfig = require("../model/buy-price-rule-config.mdl");

const DEFAULT_BUY_PRICE_RULES = [
  { minFmv: null, maxFmv: 60, mode: "subtract", value: 20 },
  { minFmv: 60, maxFmv: 121, mode: "percent", value: 35 },
  { minFmv: 121, maxFmv: 200, mode: "percent", value: 30 },
  { minFmv: 200, maxFmv: null, mode: "percent", value: 25 },
];

function normalizeBuyPriceRules(rules) {
  if (!Array.isArray(rules) || rules.length === 0) {
    return DEFAULT_BUY_PRICE_RULES.map((r) => ({ ...r }));
  }
  return rules.map((r) => ({
    minFmv:
      r && r.minFmv != null && r.minFmv !== "" && Number.isFinite(Number(r.minFmv))
        ? Number(r.minFmv)
        : null,
    maxFmv:
      r && r.maxFmv != null && r.maxFmv !== "" && Number.isFinite(Number(r.maxFmv))
        ? Number(r.maxFmv)
        : null,
    mode: r && r.mode === "subtract" ? "subtract" : "percent",
    value: r && Number.isFinite(Number(r.value)) ? Number(r.value) : 0,
  }));
}

function computeBuyPriceFromRules(fmv, rules) {
  if (fmv == null || !Number.isFinite(Number(fmv))) return null;
  const n = Number(fmv);
  const activeRules = normalizeBuyPriceRules(rules);
  for (const rule of activeRules) {
    const minOk = rule.minFmv == null || n >= rule.minFmv;
    const maxOk = rule.maxFmv == null || n < rule.maxFmv;
    if (!minOk || !maxOk) continue;
    if (rule.mode === "subtract") {
      return Number((n - Number(rule.value || 0)).toFixed(2));
    }
    return Number((n * (1 - Number(rule.value || 0) / 100)).toFixed(2));
  }
  return null;
}

function getEffectiveRowBuyPrice(row, rules) {
  if (!row || typeof row !== "object") return 0;
  if (row.buyPrice != null && Number.isFinite(Number(row.buyPrice))) {
    return Number(row.buyPrice);
  }
  const computed = computeBuyPriceFromRules(row.ptmBuyPrice, rules);
  return computed != null ? computed : 0;
}

function recomputePersonTotals(personData, rules) {
  if (!personData || !Array.isArray(personData.pedals)) return { totalPrice: 0, totalOffer: 0 };
  const totalPrice = personData.pedals.reduce(
    (sum, p) => sum + (p && p.ptmBuyPrice != null && Number.isFinite(Number(p.ptmBuyPrice)) ? Number(p.ptmBuyPrice) : 0),
    0
  );
  const totalOffer = personData.pedals.reduce((sum, p) => sum + getEffectiveRowBuyPrice(p, rules), 0);
  personData.totalPrice = Number(totalPrice.toFixed(2));
  personData.totalOffer = Number(totalOffer.toFixed(2));
  return { totalPrice: personData.totalPrice, totalOffer: personData.totalOffer };
}

async function getActiveBuyPriceRules() {
  const doc = await BuyPriceRuleConfig.findOne({ key: "default" }).select("rules");
  if (!doc || !Array.isArray(doc.rules) || doc.rules.length === 0) {
    return normalizeBuyPriceRules(DEFAULT_BUY_PRICE_RULES);
  }
  return normalizeBuyPriceRules(doc.rules);
}

module.exports = {
  DEFAULT_BUY_PRICE_RULES,
  normalizeBuyPriceRules,
  computeBuyPriceFromRules,
  getEffectiveRowBuyPrice,
  recomputePersonTotals,
  getActiveBuyPriceRules,
};

