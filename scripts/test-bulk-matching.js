/**
 * Bulk-test the matching engine against the client's spreadsheet.
 * Reports match/no-match rates, AI usage, response times, and writes results to a CSV.
 *
 * Usage: node scripts/test-bulk-matching.js [limit] [offset]
 *   limit:  number of pedals to test (default 100)
 *   offset: skip the first N rows of the spreadsheet (default 0)
 */
require("dotenv").config();
const fs = require("fs");
const path = require("path");
const mongoose = require("mongoose");
const { findMatchingProduct } = require("../services/matching");
const { loadProductCache } = require("../services/productCache");

const MONGO_URI = process.env.MONGO_URI || "mongodb://127.0.0.1:27017/pedal_prices_v2";
const LIMIT = parseInt(process.argv[2] || "100", 10);
const OFFSET = parseInt(process.argv[3] || "0", 10);
const CSV_PATH = path.join(__dirname, "..", "best one so far updated.csv");
const OUTPUT_PATH = path.join(__dirname, "..", "logs", `bulk-test-results-${Date.now()}.csv`);

(async () => {
  if (!fs.existsSync(CSV_PATH)) {
    console.error(`CSV not found at: ${CSV_PATH}`);
    process.exit(1);
  }

  console.log(`Connecting to ${MONGO_URI}...`);
  await mongoose.connect(MONGO_URI);
  console.log("Loading product cache...");
  await loadProductCache();

  // Read first column (Core_SKU) from the CSV, skip header
  console.log(`Reading pedals from ${CSV_PATH}...`);
  const csv = fs.readFileSync(CSV_PATH, "utf8");
  const lines = csv.split("\n").slice(1).filter((l) => l.trim());
  const pedals = lines
    .map((line) => line.split(",")[0].trim())
    .filter(Boolean)
    .slice(OFFSET, OFFSET + LIMIT);

  console.log(`\nTesting ${pedals.length} pedals (offset ${OFFSET}, limit ${LIMIT})\n`);

  let matched = 0;
  let unmatched = 0;
  let aiTriggered = 0;
  let totalMs = 0;
  const slow = []; // pedals taking > 500ms (likely AI calls)
  const noMatchList = [];
  const sampleMatches = [];

  // CSV output
  const out = ["input,matched_product,match_type_ms,response_ms"];

  for (const pedalName of pedals) {
    if (!pedalName) continue;
    const t0 = Date.now();
    const product = await findMatchingProduct(pedalName);
    const elapsed = Date.now() - t0;
    totalMs += elapsed;

    const matchedTitle = product ? product.title : "(no match)";
    out.push(`"${pedalName.replace(/"/g, '""')}","${matchedTitle.replace(/"/g, '""')}",${elapsed}`);

    if (product) {
      matched++;
      if (elapsed > 500) {
        aiTriggered++;
        slow.push({ pedalName, matchedTitle, elapsed });
      }
      if (sampleMatches.length < 30) sampleMatches.push({ pedalName, matchedTitle, elapsed });
    } else {
      unmatched++;
      noMatchList.push(pedalName);
    }

    // Lightweight progress every 25
    if ((matched + unmatched) % 25 === 0) {
      process.stdout.write(`  ...${matched + unmatched}/${pedals.length}\r`);
    }
  }

  // Write CSV output
  fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  fs.writeFileSync(OUTPUT_PATH, out.join("\n"));

  console.log(`\n──────────────────`);
  console.log(`Tested: ${pedals.length}`);
  console.log(`Matched: ${matched} (${((matched / pedals.length) * 100).toFixed(1)}%)`);
  console.log(`Unmatched: ${unmatched} (${((unmatched / pedals.length) * 100).toFixed(1)}%)`);
  console.log(`Likely AI calls (>500ms): ${aiTriggered}`);
  console.log(`Total time: ${(totalMs / 1000).toFixed(1)}s`);
  console.log(`Avg per pedal: ${Math.round(totalMs / pedals.length)}ms`);

  console.log(`\nFirst 30 matches (sample):`);
  for (const s of sampleMatches.slice(0, 30)) {
    const flag = s.elapsed > 500 ? "🧠" : "  ";
    console.log(`  ${flag} "${s.pedalName}" → "${s.matchedTitle}" (${s.elapsed}ms)`);
  }

  if (slow.length) {
    console.log(`\nAI-resolved matches (likely Claude):`);
    for (const s of slow.slice(0, 20)) {
      console.log(`  🧠 "${s.pedalName}" → "${s.matchedTitle}" (${s.elapsed}ms)`);
    }
  }

  if (noMatchList.length) {
    console.log(`\nFirst 20 no-match cases (review for accuracy gaps):`);
    for (const p of noMatchList.slice(0, 20)) {
      console.log(`  ✗ "${p}"`);
    }
  }

  console.log(`\nFull results CSV: ${OUTPUT_PATH}`);
  await mongoose.disconnect();
  process.exit(0);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
