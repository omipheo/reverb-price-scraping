/**
 * Export all pedal products with their full historical price data to TWO CSV files:
 *   A) Horizontal: one row per pedal, transactions extending right (Hist N Condition/Date/Price)
 *   B) Vertical: one row per transaction (pedal info repeated)
 *
 * Usage: node scripts/export-historical-prices.js
 * Output:
 *   logs/reverb-historical-prices-horizontal-<date>.csv
 *   logs/reverb-historical-prices-vertical-<date>.csv
 */
require("dotenv").config();
const fs = require("fs");
const path = require("path");
const mongoose = require("mongoose");
const Product = require("../model/product.mdl");

const MONGO_URI = process.env.MONGO_URI || "mongodb://127.0.0.1:27017/pedal_prices_v2";

// Same non-pedal filter as the main export
const NON_PEDAL_PATTERNS = [
  /\b(stratocaster|telecaster|les paul|flying v|explorer|firebird|thunderbird|jaguar|jazzmaster|jazz bass|precision bass|mustang|casino|sg standard|sg classic|sg special)\b/i,
  /\b(electric guitar|acoustic guitar|classical guitar|electric bass|bass guitar|acoustic bass)\b/i,
  /\b(double cutaway|single cutaway|semi-hollow|solid body|set neck|bolt-on neck)\b/i,
  /\b(amp head|amplifier head|speaker cabinet|speaker cab|combo amp|amp combo|tube amp|guitar combo|bass combo|guitar head|bass head|tube head|class-a)\b/i,
  /\b\d+\s*watt\b.*\b(combo|head|cab|amp)\b/i,
  /\b\d+\s*watt\s+(guitar|bass|tube)\b/i,
  /\b\d+x\d+\b/i,
  /\b(humbucker|pickup set|single coil|p-?90 pickup|noiseless pickup|hot rails|jazz bass pickup)\b/i,
  /\bpickup(s)?\b/i,
  /\b(audio interface|usb interface|midi controller|midi keyboard|preamp module|rack mount|rackmount|500 series)\b/i,
  /\b(microphone|condenser mic|dynamic mic|ribbon mic|shotgun mic|lavalier mic|wireless mic|handheld mic)\b/i,
  /\b(synthesizer|synth keyboard|keyboard synth|midi synth|workstation keyboard|stage piano|digital piano)\b/i,
  /\b(power supply|pedal power|dc adapter|wall wart|9v adapter|ac adapter)\b/i,
  /\b(guitar cables?|patch cables?|instrument cables?|xlr cables?|microphone cables?|mic cables?|speaker cables?|trs cables?|midi cables?|extension cables?|cable kits?)\b/i,
  /\b(male to male|male to female|female to female)\b/i,
  /\b(guitar strap|guitar stand|gig bag|guitar case|hard case|amp stand|mic stand|music stand|tablet stand|laptop stand|keyboard stand|cymbal stand|drum stand)\b/i,
  /\b(ear ?plugs?|in-ear|in ear monitor)\b/i,
  /\b(noise reduction system|noise gate rack)\b/i,
  /\b(midi control surface|control surface|drum machine module)\b/i,
  /\b(tuner key|tuning key|tuning machine|machine head|locking tuner)\b/i,
  /\b(string set|guitar strings|bass strings|nylon strings|steel strings)\b/i,
  /\b(drum kit|snare drum|bass drum|cymbal|hi-hat|drum head|tom drum|kick drum|drum set|drum throne|drumstick|djembe|cajon|cajón|conga|bongos?|tambourine|maracas?)\b/i,
  /\b(snare|cymbal|kick pedal|drum pedal|double bass drum)\b/i,
  /\b(turntable|vinyl|dj mixer|dj controller|slipmat|cartridge|stylus|tonearm)\b/i,
  /\b(studio monitor|nearfield monitor|reference monitor|monitor speaker|powered speaker|subwoofer|pa speaker)\b/i,
  /\b(headphones?|earbuds?|in-ear monitor|iem|ear ?phone)\b/i,
  /\b(mixing console|mixing board|mixer console|sound mixer|audio mixer)\b/i,
  /\b(ukulele|mandolin|banjo|violin|cello|harmonica|accordion|keytar|sax(ophone)?|trumpet|trombone|flute)\b/i,
  /\b(software|plugin|virtual instrument|instructional|dvd|cd-rom|t-shirt|tshirt|sticker|poster|patch \(clothing\))\b/i,
  /\b(wireless speaker|bluetooth speaker|portable speaker|pa system|line array)\b/i,
  /\b(record player|reel to reel|reel-to-reel|cassette deck|tape deck|metronome)\b/i,
  /\b(strap|strap lock|capo|slide|picks?|plectrum|guitar nut|d-tuna|d tuna|tailpiece|tremolo bar|whammy bar|saddle screw)\b/i,
  /\b(compression driver|line driver|horn driver|woofer|tweeter)\b/i,
  /\b(foam sheet|foam panel|acoustic foam|sound foam|bass trap|acoustic panel)\b/i,
  /\b(gaffer'?s? tape|duct tape|electrical tape|velcro|cable tie|cable wrap)\b/i,
  /\b(dongle|usb dongle|usb stick|usb drive|memory card|sd card)\b/i,
  /\b(stand alone|standalone unit|rack unit)\b/i,
  /\b\d+u\s+(rack|desktop|studio)\b/i,
  /\b(antenna|wireless receiver|wireless transmitter)\b/i,
  /\b(carry bag|tote bag|carrying case|backpack|messenger bag)\b/i,
  /\bsignature\s+(guitar|bass|model)\b/i,
  /\bclip[- ]?on\b/i,
  /\b(cassette|4[- ]track recorder|8[- ]track recorder|ministudio|porta\b|porta studio|portastudio)\b/i,
  /\b(switch tip|knob|knurled|bridge saddle|jack plate|truss rod|tuning peg|replacement part|spare part|spring set)\b/i,
  /\b(mobile mic|usb mic|podcast mic|broadcast mic|drum mic|kick mic|overhead mic)\b/i,
];
function isNonPedal(title) {
  if (!title) return false;
  if (/\bpedal steel\b/i.test(title)) return true;
  if (/\b(pedal|stompbox|footswitch)\b/i.test(title)) return false;
  return NON_PEDAL_PATTERNS.some((re) => re.test(title));
}

function extractModel(title, brand) {
  if (!title) return "";
  const t = title.trim();
  const b = (brand || "").trim();
  if (!b) return t;
  if (t.toLowerCase().startsWith(b.toLowerCase())) return t.slice(b.length).trim();
  return t;
}

function unixToDate(sec) {
  if (!sec || !Number.isFinite(sec) || sec <= 0) return "";
  const d = new Date(sec * 1000);
  if (isNaN(d.getTime())) return "";
  return `${d.getMonth() + 1}/${d.getDate()}/${String(d.getFullYear()).slice(-2)}`;
}

// CSV escape: wrap in quotes if contains comma, quote, or newline; double quotes inside
function csvEscape(val) {
  if (val == null) return "";
  const s = String(val);
  if (/[",\r\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

(async () => {
  console.log(`Connecting to ${MONGO_URI}...`);
  await mongoose.connect(MONGO_URI);

  console.log("Loading all products with priceGuide...");
  const allProducts = await Product.find({})
    .select("canonicalProductId title brand slug hasPriceGuide priceGuide priceGuideSummary.all.count")
    .lean();
  console.log(`Loaded ${allProducts.length} products.`);

  // Filter to pedals only, exclude user-added
  const products = allProducts.filter((p) => {
    if ((p.canonicalProductId || "").startsWith("user-added-")) return false;
    if (isNonPedal(p.title)) return false;
    return true;
  });
  console.log(`After filter: ${products.length} pedals.`);

  const outDir = path.join(__dirname, "..", "logs");
  fs.mkdirSync(outDir, { recursive: true });
  const stamp = new Date().toISOString().slice(0, 10);

  // First pass: determine maxTransactions for horizontal layout
  let maxTransactions = 0;
  let totalTransactions = 0;
  for (const p of products) {
    const n = (p.priceGuide || []).length;
    if (n > maxTransactions) maxTransactions = n;
    totalTransactions += n;
  }
  console.log(`Max transactions per pedal: ${maxTransactions}`);
  console.log(`Total transactions: ${totalTransactions}`);

  // ─── HORIZONTAL CSV ─────────────────────────────────────────────
  const horizPath = path.join(outDir, `reverb-historical-prices-horizontal-${stamp}.csv`);
  const horizStream = fs.createWriteStream(horizPath);

  // Header
  const baseHeaders = ["Make", "Model", "Full Title", "Canonical Product ID", "Slug", "Has Price Guide", "Total Transactions"];
  const histHeaders = [];
  for (let i = 1; i <= maxTransactions; i++) {
    histHeaders.push(`Hist ${i} Condition`, `Hist ${i} Date`, `Hist ${i} Price`);
  }
  horizStream.write([...baseHeaders, ...histHeaders].map(csvEscape).join(",") + "\n");

  // Rows
  console.log("Writing horizontal CSV...");
  let count = 0;
  for (const p of products) {
    const make = p.brand || "";
    const model = extractModel(p.title, make);
    const sortedPg = [...(p.priceGuide || [])].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)); // newest first
    const row = [
      csvEscape(make),
      csvEscape(model),
      csvEscape(p.title || ""),
      csvEscape(p.canonicalProductId || ""),
      csvEscape(p.slug || ""),
      csvEscape(p.hasPriceGuide ? "Yes" : "No"),
      csvEscape(sortedPg.length),
    ];
    for (const t of sortedPg) {
      row.push(csvEscape(t.condition || ""));
      row.push(csvEscape(unixToDate(t.createdAt)));
      row.push(csvEscape(t.amount != null ? Math.round(t.amount * 100) / 100 : ""));
    }
    // Pad to maxTransactions
    const pad = (maxTransactions - sortedPg.length) * 3;
    for (let i = 0; i < pad; i++) row.push("");
    horizStream.write(row.join(",") + "\n");
    count++;
    if (count % 5000 === 0) process.stdout.write(`  ${count}/${products.length}\r`);
  }
  horizStream.end();
  await new Promise((r) => horizStream.on("close", r));
  console.log(`\n✓ Wrote ${horizPath}`);
  console.log(`  ${count} rows × ${baseHeaders.length + histHeaders.length} columns`);

  // ─── VERTICAL CSV ──────────────────────────────────────────────
  const vertPath = path.join(outDir, `reverb-historical-prices-vertical-${stamp}.csv`);
  const vertStream = fs.createWriteStream(vertPath);
  const vertHeaders = ["Make", "Model", "Full Title", "Canonical Product ID", "Slug", "Condition", "Date", "Price"];
  vertStream.write(vertHeaders.map(csvEscape).join(",") + "\n");

  console.log("Writing vertical CSV...");
  let txnCount = 0;
  for (const p of products) {
    const make = p.brand || "";
    const model = extractModel(p.title, make);
    const sortedPg = [...(p.priceGuide || [])].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    for (const t of sortedPg) {
      const row = [
        csvEscape(make),
        csvEscape(model),
        csvEscape(p.title || ""),
        csvEscape(p.canonicalProductId || ""),
        csvEscape(p.slug || ""),
        csvEscape(t.condition || ""),
        csvEscape(unixToDate(t.createdAt)),
        csvEscape(t.amount != null ? Math.round(t.amount * 100) / 100 : ""),
      ];
      vertStream.write(row.join(",") + "\n");
      txnCount++;
      if (txnCount % 100000 === 0) process.stdout.write(`  ${txnCount} transactions\r`);
    }
  }
  vertStream.end();
  await new Promise((r) => vertStream.on("close", r));
  console.log(`\n✓ Wrote ${vertPath}`);
  console.log(`  ${txnCount} transaction rows × ${vertHeaders.length} columns`);

  // File sizes
  const horizSize = (fs.statSync(horizPath).size / 1024 / 1024).toFixed(1);
  const vertSize = (fs.statSync(vertPath).size / 1024 / 1024).toFixed(1);
  console.log(`\nFile sizes:`);
  console.log(`  Horizontal: ${horizSize} MB`);
  console.log(`  Vertical:   ${vertSize} MB`);

  await mongoose.disconnect();
  process.exit(0);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
