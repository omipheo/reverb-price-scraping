/**
 * Test the AI fallback layer on real unmatched pedals from MatchFeedbackLog.
 * Usage: node scripts/test-ai-fallback.js [limit]
 * Default limit: 20 pedals
 */
require("dotenv").config();
const mongoose = require("mongoose");
const { findMatchingProduct } = require("../services/matching");
const { loadProductCache } = require("../services/productCache");
const MatchFeedbackLog = require("../model/match-feedback-log.mdl");

const MONGO_URI = process.env.MONGO_URI || "mongodb://127.0.0.1:27017/pedal_prices_v2";
const LIMIT = parseInt(process.argv[2] || "20", 10);

(async () => {
  console.log(`Connecting to ${MONGO_URI}...`);
  await mongoose.connect(MONGO_URI);
  console.log("Loading product cache...");
  await loadProductCache();

  console.log(`\nFetching last ${LIMIT} no-match pedals from feedback log...\n`);
  const entries = await MatchFeedbackLog.find({ noMatch: true })
    .sort({ createdAt: -1 })
    .limit(LIMIT)
    .select("pedal matchNotes")
    .lean();

  if (entries.length === 0) {
    console.log("No unmatched pedals in feedback log. Try running searches first.");
    process.exit(0);
  }

  let matched = 0;
  let unmatched = 0;
  const start = Date.now();

  for (const entry of entries) {
    const pedalName = entry.pedal;
    if (!pedalName) continue;
    process.stdout.write(`"${pedalName}" → `);
    const t0 = Date.now();
    const product = await findMatchingProduct(pedalName);
    const elapsed = Date.now() - t0;
    if (product) {
      console.log(`✓ "${product.title}" (${elapsed}ms)`);
      matched++;
    } else {
      console.log(`✗ no match (${elapsed}ms)`);
      unmatched++;
    }
  }

  const totalMs = Date.now() - start;
  console.log(`\n──────────────────`);
  console.log(`Tested: ${entries.length}`);
  console.log(`Matched: ${matched} (${((matched / entries.length) * 100).toFixed(1)}%)`);
  console.log(`Unmatched: ${unmatched}`);
  console.log(`Total time: ${(totalMs / 1000).toFixed(1)}s`);
  console.log(`Avg per pedal: ${Math.round(totalMs / entries.length)}ms`);

  await mongoose.disconnect();
  process.exit(0);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
