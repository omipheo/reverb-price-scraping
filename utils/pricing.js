const { normalizeCondition } = require("./normalization");

// Utility: Calculate offer based on price
function calculateOffer(price) {
  if (!price || price <= 0) return 0;
  if (price <= 69) return 20;
  if (price <= 199) return Math.round(price * 0.7);
  return Math.round(price * 0.75);
}

// Utility: Calculate median (middle value) from an array of numbers
function median(nums) {
  if (!nums || nums.length === 0) return 0;
  const s = [...nums].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

// Utility: Calculate price from product transactions based on condition
function calculatePriceFromTransactions(product, condition = null) {
  if (!product || !product.priceGuide || product.priceGuide.length === 0) {
    return null;
  }

  // Sort transactions by createdAt (most recent first)
  const sortedTransactions = [...product.priceGuide].sort((a, b) => {
    return (b.createdAt || 0) - (a.createdAt || 0);
  });

  let relevantTransactions = [];

  if (condition && condition !== "Unknown") {
    // Normalize condition for matching
    const normalizedCondition = normalizeCondition(condition);
    
    // With condition: Get last 6 transactions in that specific condition
    // Match case-insensitively
    relevantTransactions = sortedTransactions
      .filter(t => {
        const txCondition = normalizeCondition(t.condition);
        return txCondition === normalizedCondition;
      })
      .slice(0, 6);
    console.log("relevantTransactions", relevantTransactions);
    // Take average of middle 2 (remove first 2 and last 2, keep middle 2)
    if (relevantTransactions.length >= 6) {
      relevantTransactions = relevantTransactions.slice(2, 4); // Middle 2 (indices 2 and 3)
    } else if (relevantTransactions.length >= 4) {
      // If we have 4-5 transactions, take middle 2
      const start = Math.floor((relevantTransactions.length - 2) / 2);
      relevantTransactions = relevantTransactions.slice(start, start + 2);
    }
    // If less than 4, use all available
  } else {
    // Without condition: Get last 14 non-mint transactions
    // We need to look through transactions until we find 14 non-mint ones
    for (const tx of sortedTransactions) {
      const txCondition = normalizeCondition(tx.condition);
      if (txCondition !== "Mint") {
        relevantTransactions.push(tx);
        if (relevantTransactions.length >= 14) {
          break;
        }
      }
    }
    // Take average of middle 6 (remove first 4 and last 4, keep middle 6)
    if (relevantTransactions.length >= 14) {
      relevantTransactions = relevantTransactions.slice(4, 10); // Middle 6 (indices 4-9)
    } else if (relevantTransactions.length >= 10) {
      // If we have 10-13 transactions, take middle 6
      const start = Math.floor((relevantTransactions.length - 6) / 2);
      relevantTransactions = relevantTransactions.slice(start, start + 6);
    } else if (relevantTransactions.length >= 6) {
      // If we have 6-9 transactions, take middle 2-4
      const start = Math.floor((relevantTransactions.length - 2) / 2);
      relevantTransactions = relevantTransactions.slice(start, start + 2);
    }
    // If less than 6, use all available
  }

  if (relevantTransactions.length === 0) {
    return null;
  }

  // Calculate average of the selected transactions
  const amounts = relevantTransactions
    .map(t => t.amount)
    .filter(Number.isFinite);

  if (amounts.length === 0) {
    return null;
  }
  console.log("amounts", amounts);
  const sum = amounts.reduce((a, b) => a + b, 0);
  const average = sum / amounts.length;
  
  // Apply discount based on price
  // For pedals over $200: lower by 5%
  // For pedals under $200: lower by 10%
  let adjustedPrice = average;
  if (average >= 200) {
    adjustedPrice = average * 0.95; // 5% discount
  } else {
    adjustedPrice = average * 0.90; // 10% discount
  }

  return Number(adjustedPrice.toFixed(2));
}

// Helper: add 1 year to a date
function addOneYear(date) {
  const d = new Date(date);
  d.setFullYear(d.getFullYear() + 1);
  return d;
}

// Helper: round to nearest X9; if exactly in middle (e.g. 115.5) round up
function roundToEndIn9(value) {
  if (value == null || !Number.isFinite(value) || value < 0) return null;
  const lower9 = Math.floor((value + 1) / 10) * 10 - 1;
  const upper9 = lower9 + 10;
  const mid = (lower9 + upper9) / 2;
  return value >= mid ? upper9 : lower9;
}

// Calculate PTM Sell Price from product. Assume 6+ for sale; use transaction history high only (no Reverb suggested yet).
function calculatePtmSellPrice(product) {
  if (!product || !product.priceGuideSummary || !product.priceGuideSummary.all) return null;
  const high = product.priceGuideSummary.all.high;
  if (high == null || !Number.isFinite(high) || high <= 0) return null;
  const quantityForSale = 6; // Assume 6+ until we have real data
  const is6Plus = quantityForSale >= 6;
  const is91Plus = high >= 91;
  let pct;
  if (is6Plus && is91Plus) pct = 0.10;
  else if (is6Plus && !is91Plus) pct = 0.15;
  else if (!is6Plus && is91Plus) pct = 0.20;
  else pct = 0.25;
  const withPct = high * (1 + pct);
  return roundToEndIn9(withPct);
}

module.exports = {
  calculateOffer,
  median,
  calculatePriceFromTransactions,
  addOneYear,
  roundToEndIn9,
  calculatePtmSellPrice,
};
