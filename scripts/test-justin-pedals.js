#!/usr/bin/env node
/**
 * Test: same flow as Dovid — pedal names from Justin spreadsheet.
 * Checks: (1) correct pedal match, (2) Reverb PG price, Market Sold, PTM Sell.
 * Run: node scripts/test-justin-pedals.js [cleaned.csv] [--limit N] [--out results.json]
 *   No arg: use built-in sample list.
 *   Arg: path to cleaned CSV (pedal_name, condition, price); uses unique pedal_name from file.
 *   --limit N: when using CSV, only test first N unique pedals (default: all).
 *   --out file: write summary + noMatch list + details to JSON (for large runs).
 *   --out-matches file: write ALL matches to CSV (input,matched_product,pg_price) for manual validation.
 * Requires: MongoDB running, MONGO_URI in .env or default.
 */
require("dotenv").config();
const fs = require("fs");
const path = require("path");
const connectDB = require("../config/database");
const { findMatchingProduct } = require("../services/matching");
const {
  calculatePriceFromTransactions,
  calculatePtmSellPrice,
} = require("../utils/pricing");

// Sample pedal names when no CSV provided
const SAMPLE_PEDALS = [
  "Pro Co Rat Whiteface Reissue",
  "Boss CE-2w",
  "Line 6 HX Stomp",
  "Ibanez TS9DX Turbo Tube Screamer",
  "Dunlop Cry Baby Standard Wah",
  "Keeley Katana",
  "JET Micro",
  "Danelectro Spring King Reverb",
  "Demonfx King of Drive",
  "Boss PH-3",
  "Duke of Tone",
  "Gibraltar SC-15C Generic Bass Drum Pedal Spring",
  "CIOKS DC8 Power Supply",
  "Voodoo Lab PPAY",
];

function parseCsvLine(line) {
  const out = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') inQuotes = !inQuotes;
    else if (c === "," && !inQuotes) {
      out.push(cur.trim());
      cur = "";
    } else cur += c;
  }
  out.push(cur.trim());
  return out;
}

function loadPedalNamesFromCsv(csvPath) {
  const content = fs.readFileSync(csvPath, "utf8");
  const lines = content.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return [];
  const header = lines[0].toLowerCase();
  const cols = parseCsvLine(lines[0]).map((c) => c.trim().toLowerCase());
  const idx = cols.indexOf("pedal_name");
  if (idx === -1) return [];
  const seen = new Set();
  const names = [];
  for (let i = 1; i < lines.length; i++) {
    const row = parseCsvLine(lines[i]);
    const name = row[idx] != null ? String(row[idx]).trim() : "";
    if (name && !seen.has(name)) {
      seen.add(name);
      names.push(name);
    }
  }
  return names;
}

async function run() {
  const args = process.argv.slice(2);
  const csvPath = args.find((a) => !a.startsWith("--"));
  const limitIdx = args.indexOf("--limit");
  const limit = limitIdx >= 0 && args[limitIdx + 1] ? parseInt(args[limitIdx + 1], 10) : null;
  const outIdx = args.indexOf("--out");
  const outFile = outIdx >= 0 && args[outIdx + 1] ? args[outIdx + 1] : null;
  const outMatchesIdx = args.indexOf("--out-matches");
  const outMatchesFile = outMatchesIdx >= 0 && args[outMatchesIdx + 1] ? args[outMatchesIdx + 1] : null;
  let pedalList = csvPath
    ? loadPedalNamesFromCsv(path.resolve(csvPath))
    : SAMPLE_PEDALS;
  if (limit != null && Number.isFinite(limit) && pedalList.length > limit) {
    pedalList = pedalList.slice(0, limit);
  }

  if (pedalList.length === 0) {
    console.error(csvPath ? "No pedal_name column or no rows in CSV." : "No pedals.");
    process.exit(1);
  }

  const mongoUri = process.env.MONGO_URI || "mongodb://127.0.0.1:27017/pedal_prices_v2";
  await connectDB(mongoUri);

  console.log("\n--- Test: Justin-style pedal names (match + pricing) ---");
  if (csvPath) console.log("  Source:", csvPath, "| Unique pedals:", pedalList.length);
  console.log("");

  let matched = 0;
  const details = [];
  const focusPedal = "Pro Co Rat Whiteface Reissue";
  const isLargeRun = pedalList.length > 100;
  const progressInterval = isLargeRun ? Math.max(1, Math.floor(pedalList.length / 20)) : 0;

  for (let i = 0; i < pedalList.length; i++) {
    const pedalName = pedalList[i];
    if (progressInterval && i > 0 && i % progressInterval === 0) {
      console.log(`  ... ${i}/${pedalList.length}`);
    }
    const condition = null;
    const product = await findMatchingProduct(pedalName, condition);
    const isFocus = pedalName === focusPedal;

    if (product) {
      matched++;
      const pgPrice = calculatePriceFromTransactions(product, condition);
      const marketSold = product.reverbMarketSoldPrice ?? null;
      const ptmSell = product.ptmSellPrice != null
        ? product.ptmSellPrice
        : calculatePtmSellPrice(product);

      details.push({
        input: pedalName,
        matched: product.title,
        brand: product.brand,
        pgPrice,
        marketSold,
        ptmSell,
      });

      if (isFocus && !isLargeRun) {
        console.log("--- Dovid example: Pro Co Rat Whiteface Reissue ---");
        console.log("  Matched product:", product.title);
        console.log("  Brand:", product.brand);
        console.log("  Reverb PG (hist) price:", pgPrice != null ? `$${pgPrice.toFixed(2)}` : "null");
        console.log("  Reverb Market Sold price (DB):", marketSold != null ? `$${marketSold}` : "null");
        console.log("  PTM Sell price:", ptmSell != null ? `$${ptmSell}` : "null");
        console.log("  priceGuideSummary.all:", JSON.stringify(product.priceGuideSummary?.all || {}));
        console.log("");
      }
    } else {
      details.push({
        input: pedalName,
        matched: null,
        brand: null,
        pgPrice: null,
        marketSold: null,
        ptmSell: null,
      });
    }
  }

  console.log("--- Summary ---");
  console.log(`  Pedals tested: ${pedalList.length}`);
  console.log(`  Matched: ${matched}`);
  console.log(`  No match: ${pedalList.length - matched}`);
  if (pedalList.length > 0) {
    console.log(`  Match rate: ${((matched / pedalList.length) * 100).toFixed(1)}%`);
  }
  console.log("");

  const noMatches = details.filter((d) => !d.matched);
  if (noMatches.length > 0) {
    console.log(`--- No match (${noMatches.length}) ---`);
    const show = isLargeRun ? noMatches.slice(0, 100) : noMatches;
    show.forEach((d) => console.log("  " + d.input));
    if (isLargeRun && noMatches.length > 100) {
      console.log(`  ... and ${noMatches.length - 100} more`);
    }
    console.log("");
  }

  if (!isLargeRun) {
    console.log("--- All results (input -> matched, PG, Market Sold, PTM Sell) ---");
    for (const d of details) {
      const matchStr = d.matched ? d.matched : "(no match)";
      const pgStr = d.pgPrice != null ? `$${d.pgPrice.toFixed(2)}` : "-";
      const soldStr = d.marketSold != null ? `$${d.marketSold}` : "-";
      const sellStr = d.ptmSell != null ? `$${d.ptmSell}` : "-";
      console.log(`  ${d.input}`);
      console.log(`    -> ${matchStr} | PG: ${pgStr} | MarketSold: ${soldStr} | PTMSell: ${sellStr}`);
    }
  } else {
    console.log("--- Sample matches (first 15) ---");
    details.filter((d) => d.matched).slice(0, 15).forEach((d) => {
      const pgStr = d.pgPrice != null ? `$${d.pgPrice.toFixed(2)}` : "-";
      console.log(`  ${d.input} -> ${d.matched} | PG: ${pgStr}`);
    });
  }

  if (outFile) {
    const summary = {
      total: pedalList.length,
      matched,
      noMatch: pedalList.length - matched,
      matchRatePct: pedalList.length ? ((matched / pedalList.length) * 100).toFixed(1) : 0,
      noMatchList: noMatches.map((d) => d.input),
      sampleMatches: details.filter((d) => d.matched).slice(0, 50).map((d) => ({
        input: d.input,
        matched: d.matched,
        pgPrice: d.pgPrice,
        marketSold: d.marketSold,
        ptmSell: d.ptmSell,
      })),
    };
    fs.writeFileSync(outFile, JSON.stringify(summary, null, 2), "utf8");
    console.log("\nWrote summary to", outFile);
  }

  if (outMatchesFile) {
    const escapeCsv = (s) => (s == null ? "" : String(s).replace(/"/g, '""'));
    const rows = [
      "input,matched_product,pg_price,market_sold,ptm_sell,correct_YN_notes",
      ...details.filter((d) => d.matched).map((d) =>
        [
          escapeCsv(d.input),
          escapeCsv(d.matched),
          d.pgPrice != null ? d.pgPrice : "",
          d.marketSold != null ? d.marketSold : "",
          d.ptmSell != null ? d.ptmSell : "",
          "",
        ].map((c) => `"${escapeCsv(c)}"`).join(",")
      ),
    ];
    fs.writeFileSync(outMatchesFile, rows.join("\n"), "utf8");
    console.log("Wrote matches to review:", outMatchesFile);
  }

  process.exit(0);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
