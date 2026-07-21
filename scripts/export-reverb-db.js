/**
 * Export all Reverb DB products to an XLSX with 3 sheets:
 *   1. All pedals (full list)
 *   2. Definite duplicates (same make + same normalized model)
 *   3. Suspected duplicates (near-matches like "DD-7" vs "DD7")
 *
 * Usage: node scripts/export-reverb-db.js
 * Output: logs/reverb-db-export-<timestamp>.xlsx
 */
require("dotenv").config();
const fs = require("fs");
const path = require("path");
const mongoose = require("mongoose");
const ExcelJS = require("exceljs");
const Product = require("../model/product.mdl");
const { normalizePedalName } = require("../utils/normalization");
const { buildReverbPgLink, buildReverbMarketSoldLink } = require("../utils/reverb");
const { getActiveBuyPriceRules, computeBuyPriceFromRules } = require("../utils/buyPriceRules");

function unixToDate(sec) {
  if (!sec || !Number.isFinite(sec) || sec <= 0) return "";
  const d = new Date(sec * 1000);
  if (isNaN(d.getTime())) return "";
  return `${d.getMonth() + 1}/${d.getDate()}/${String(d.getFullYear()).slice(-2)}`;
}
function fmtMoney(n) {
  if (n == null || !Number.isFinite(Number(n))) return "";
  return Math.round(Number(n) * 100) / 100;
}

const MONGO_URI = process.env.MONGO_URI || "mongodb://127.0.0.1:27017/pedal_prices_v2";

// Title patterns that strongly indicate the product is NOT a pedal (guitars, amps, pickups, etc.)
// Each pattern uses word boundaries to reduce false positives. The isNonPedal() function below
// rescues anything with "pedal"/"stompbox"/"footswitch" in the title before applying these.
const NON_PEDAL_PATTERNS = [
  // Guitar / bass models
  /\b(stratocaster|telecaster|les paul|flying v|explorer|firebird|thunderbird|jaguar|jazzmaster|jazz bass|precision bass|mustang|casino|sg standard|sg classic|sg special)\b/i,
  /\b(electric guitar|acoustic guitar|classical guitar|electric bass|bass guitar|acoustic bass)\b/i,
  /\b(double cutaway|single cutaway|semi-hollow|solid body|set neck|bolt-on neck)\b/i,
  // Amps / cabs / heads
  /\b(amp head|amplifier head|speaker cabinet|speaker cab|combo amp|amp combo|tube amp|guitar combo|bass combo|guitar head|bass head|tube head|class-a)\b/i,
  /\b\d+\s*watt\b.*\b(combo|head|cab|amp)\b/i,
  /\b\d+\s*watt\s+(guitar|bass|tube)\b/i,
  /\b\d+x\d+\b/i, // speaker config like "1x12", "2x12"
  // Pickups
  /\b(humbucker|pickup set|single coil|p-?90 pickup|noiseless pickup|hot rails|jazz bass pickup)\b/i,
  /\bpickup(s)?\b/i,
  // Audio interfaces & DAW gear
  /\b(audio interface|usb interface|midi controller|midi keyboard|preamp module|rack mount|rackmount|500 series)\b/i,
  // Microphones
  /\b(microphone|condenser mic|dynamic mic|ribbon mic|shotgun mic|lavalier mic|wireless mic|handheld mic)\b/i,
  // Synths / keyboards
  /\b(synthesizer|synth keyboard|keyboard synth|midi synth|workstation keyboard|stage piano|digital piano)\b/i,
  // Power & adapters
  /\b(power supply|pedal power|dc adapter|wall wart|9v adapter|ac adapter)\b/i,
  // Cables
  /\b(guitar cables?|patch cables?|instrument cables?|xlr cables?|microphone cables?|mic cables?|speaker cables?|trs cables?|midi cables?|extension cables?|cable kits?)\b/i,
  /\b(male to male|male to female|female to female)\b/i, // very strong cable indicator
  // Stands / cases / accessories
  /\b(guitar strap|guitar stand|gig bag|guitar case|hard case|amp stand|mic stand|music stand|tablet stand|laptop stand|keyboard stand|cymbal stand|drum stand)\b/i,
  /\b(ear ?plugs?|in-ear|in ear monitor)\b/i,
  /\b(noise reduction system|noise gate rack)\b/i,
  /\b(midi control surface|control surface|drum machine module)\b/i,
  /\b(tuner key|tuning key|tuning machine|machine head|locking tuner)\b/i,
  /\b(string set|guitar strings|bass strings|nylon strings|steel strings)\b/i,
  // Drum / percussion (drum machines like Beatbuddy are pedals — careful, those have "pedal" word)
  /\b(drum kit|snare drum|bass drum|cymbal|hi-hat|drum head|tom drum|kick drum|drum set|drum throne|drumstick|djembe|cajon|cajón|conga|bongos?|tambourine|maracas?)\b/i,
  /\b(snare|cymbal|kick pedal|drum pedal|double bass drum)\b/i,
  // DJ / Turntables / vinyl
  /\b(turntable|vinyl|dj mixer|dj controller|slipmat|cartridge|stylus|tonearm)\b/i,
  // Recording / studio gear (not pedals)
  /\b(studio monitor|nearfield monitor|reference monitor|monitor speaker|powered speaker|subwoofer|pa speaker)\b/i,
  /\b(headphones?|earbuds?|in-ear monitor|iem|ear ?phone)\b/i,
  /\b(mixing console|mixing board|mixer console|sound mixer|audio mixer)\b/i,
  // Other instruments
  /\b(ukulele|mandolin|banjo|violin|cello|harmonica|accordion|keytar|sax(ophone)?|trumpet|trombone|flute)\b/i,
  // Software / books / merch
  /\b(software|plugin|virtual instrument|instructional|dvd|cd-rom|t-shirt|tshirt|sticker|poster|patch \(clothing\))\b/i,
  // Speakers (wireless / bluetooth / PA — not guitar amps)
  /\b(wireless speaker|bluetooth speaker|portable speaker|pa system|line array)\b/i,
  // Misc gear and accessories that aren't pedals
  /\b(record player|reel to reel|reel-to-reel|cassette deck|tape deck|metronome)\b/i,
  /\b(strap|strap lock|capo|slide|picks?|plectrum|guitar nut|d-tuna|d tuna|tailpiece|tremolo bar|whammy bar|saddle screw)\b/i,
  /\b(compression driver|line driver|horn driver|woofer|tweeter)\b/i,
  /\b(foam sheet|foam panel|acoustic foam|sound foam|bass trap|acoustic panel)\b/i,
  /\b(gaffer'?s? tape|duct tape|electrical tape|velcro|cable tie|cable wrap)\b/i,
  /\b(dongle|usb dongle|usb stick|usb drive|memory card|sd card)\b/i,
  /\b(stand alone|standalone unit|rack unit)\b/i,
  /\b\d+u\s+(rack|desktop|studio)\b/i, // any U-size rack/desktop
  /\b(antenna|wireless receiver|wireless transmitter)\b/i,
  /\b(carry bag|tote bag|carrying case|backpack|messenger bag)\b/i,
  /\bsignature\s+(guitar|bass|model)\b/i,
  // Clip-on / non-pedal tuners
  /\bclip[- ]?on\b/i,
  // Tape / cassette gear
  /\b(cassette|4[- ]track recorder|8[- ]track recorder|ministudio|porta\b|porta studio|portastudio)\b/i,
  // Replacement parts
  /\b(switch tip|knob|knurled|bridge saddle|jack plate|truss rod|tuning peg|replacement part|spare part|spring set)\b/i,
  // Mic variations (anything ending in "Mic" not caught above)
  /\b(mobile mic|usb mic|podcast mic|broadcast mic|drum mic|kick mic|overhead mic)\b/i,
];

function isNonPedal(title) {
  if (!title) return false;
  // Pedal steel guitars/strings/amps are NOT effects pedals — drop them
  if (/\bpedal steel\b/i.test(title)) return true;
  // If the title has "pedal" or "stompbox" or "footswitch" as a word, it's almost certainly
  // an effects pedal even if it mentions guitar/bass/etc. (e.g. "Acoustic Guitar Processor Pedal")
  if (/\b(pedal|stompbox|footswitch)\b/i.test(title)) return false;
  // Otherwise check the non-pedal patterns
  return NON_PEDAL_PATTERNS.some((re) => re.test(title));
}

// Strip brand prefix from title to get the model portion
function extractModel(title, brand) {
  if (!title) return "";
  const t = title.trim();
  const b = (brand || "").trim();
  if (!b) return t;
  // Case-insensitive prefix strip
  if (t.toLowerCase().startsWith(b.toLowerCase())) {
    return t.slice(b.length).trim();
  }
  return t;
}

// Normalize model for duplicate detection: lowercase, strip non-alphanumeric, collapse
function normalizeModel(model) {
  return (model || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "")
    .trim();
}

// Looser key for near-duplicate detection (only letters, digits, ignoring all separators)
function fuzzyKey(make, model) {
  return `${(make || "").toLowerCase().replace(/[^a-z0-9]+/g, "")}::${normalizeModel(model)}`;
}

(async () => {
  console.log(`Connecting to ${MONGO_URI}...`);
  await mongoose.connect(MONGO_URI);

  console.log("Loading buy price rules...");
  const buyRules = await getActiveBuyPriceRules();

  console.log("Loading all products...");
  const allProducts = await Product.find({})
    .select("canonicalProductId title brand slug normalizedTitle hasPriceGuide priceGuideSummary ptmBuyPrice reverbMarketSoldPrice reverbMarketSoldLink")
    .lean();
  console.log(`Loaded ${allProducts.length} products.`);

  // Filter out:
  //   1. User-added entries (canonicalProductId starts with "user-added-") — not from Reverb scrape
  //   2. Non-pedals (guitars, amps, pickups, accessories, etc.)
  const products = allProducts.filter((p) => {
    if ((p.canonicalProductId || "").startsWith("user-added-")) return false;
    if (isNonPedal(p.title)) return false;
    return true;
  });
  const dropUserAdded = allProducts.filter((p) => (p.canonicalProductId || "").startsWith("user-added-")).length;
  console.log(`Dropped ${dropUserAdded} user-added entries. Dropped ${allProducts.length - products.length - dropUserAdded} non-pedal products. ${products.length} pedals remain.`);

  // Build rows
  console.log("Processing rows...");
  const rows = products.map((p) => {
    const make = p.brand || "";
    const model = extractModel(p.title, make);
    const summary = p.priceGuideSummary?.all || {};
    const reverbPgHistPrice = Number.isFinite(summary.median) && summary.median > 0 ? summary.median : null;
    const fmv = p.ptmBuyPrice != null ? p.ptmBuyPrice : reverbPgHistPrice;
    const buyPrice = fmv != null ? computeBuyPriceFromRules(fmv, buyRules) : null;
    const pgLink = buildReverbPgLink(p);
    // Use the product page URL for Market Sold Link too — the stored marketplace search URL
    // returns "0 listings" when a product has no recent sold transactions. The product page
    // always exists if the product exists.
    const slug = (p.slug || "").trim();
    const marketSoldLink = slug ? `https://reverb.com/p/${encodeURIComponent(slug)}` : (p.reverbMarketSoldLink || buildReverbMarketSoldLink(p) || "");
    const marketSoldPrice = p.reverbMarketSoldPrice != null ? p.reverbMarketSoldPrice : null;
    return {
      make,
      model,
      title: p.title || "",
      productId: p.canonicalProductId || "",
      slug: p.slug || "",
      hasPriceGuide: p.hasPriceGuide ? "Yes" : "No",
      txnCount: summary.count || 0,
      fmv: fmtMoney(fmv),
      buyPrice: fmtMoney(buyPrice),
      reverbPgHistPrice: fmtMoney(reverbPgHistPrice),
      reverbMarketSoldPrice: fmtMoney(marketSoldPrice),
      lowPrice: fmtMoney(summary.low),
      highPrice: fmtMoney(summary.high),
      lastSoldAt: unixToDate(summary.lastSoldAt),
      reverbPgLink: pgLink || "",
      reverbMarketSoldLink: marketSoldLink || "",
      normalizedTitle: p.normalizedTitle || "",
      _normModel: normalizeModel(model),
      _fuzzyKey: fuzzyKey(make, model),
    };
  });

  // Find definite duplicates: same make + same normalized model
  console.log("Finding duplicates...");
  const byFuzzyKey = new Map();
  for (const r of rows) {
    if (!r._fuzzyKey || r._fuzzyKey === "::") continue;
    if (!byFuzzyKey.has(r._fuzzyKey)) byFuzzyKey.set(r._fuzzyKey, []);
    byFuzzyKey.get(r._fuzzyKey).push(r);
  }
  const definiteDuplicates = [];
  for (const [key, group] of byFuzzyKey.entries()) {
    if (group.length > 1) {
      for (const r of group) {
        definiteDuplicates.push({ ...r, dupGroup: key, dupCount: group.length });
      }
    }
  }
  console.log(`Found ${definiteDuplicates.length} rows across ${[...byFuzzyKey.values()].filter(g => g.length > 1).length} duplicate groups.`);

  // Suspected duplicates: same make, very similar model (Levenshtein-like via shared prefix)
  // Group by make first, then find titles with very small edit distance
  console.log("Finding suspected duplicates (this may take a minute)...");
  const byMake = new Map();
  for (const r of rows) {
    const m = (r.make || "").toLowerCase().trim();
    if (!m) continue;
    if (!byMake.has(m)) byMake.set(m, []);
    byMake.get(m).push(r);
  }

  // Lightweight similarity: drop all non-alphanumeric, compare. If identical, it's a definite dup (already caught).
  // If they share a long common substring or differ by ≤ 1 char, flag as suspected.
  function similarEnough(a, b) {
    if (!a || !b) return false;
    if (a === b) return false; // skip identical (caught as definite)
    // length diff > 2 → not similar
    if (Math.abs(a.length - b.length) > 2) return false;
    // simple edit-distance up to threshold 1
    const max = Math.max(a.length, b.length);
    if (max === 0) return false;
    let i = 0, j = 0, edits = 0;
    while (i < a.length && j < b.length && edits <= 1) {
      if (a[i] === b[j]) { i++; j++; continue; }
      edits++;
      if (a.length === b.length) { i++; j++; }
      else if (a.length > b.length) { i++; }
      else { j++; }
    }
    edits += (a.length - i) + (b.length - j);
    return edits <= 1;
  }

  const suspectedDuplicates = [];
  const seenSuspectedPair = new Set();
  for (const [make, group] of byMake.entries()) {
    if (group.length < 2) continue;
    // Sort by normalized model length for slight optimization
    const items = group.slice().sort((a, b) => a._normModel.length - b._normModel.length);
    for (let i = 0; i < items.length; i++) {
      for (let j = i + 1; j < items.length; j++) {
        const a = items[i], b = items[j];
        if (a._normModel === b._normModel) continue; // exact = definite, skip
        if (Math.abs(a._normModel.length - b._normModel.length) > 2) continue;
        if (similarEnough(a._normModel, b._normModel)) {
          const pairKey = [a.productId, b.productId].sort().join("|");
          if (seenSuspectedPair.has(pairKey)) continue;
          seenSuspectedPair.add(pairKey);
          suspectedDuplicates.push({
            make: a.make,
            modelA: a.model,
            modelB: b.model,
            titleA: a.title,
            titleB: b.title,
            productIdA: a.productId,
            productIdB: b.productId,
            txnCountA: a.txnCount,
            txnCountB: b.txnCount,
          });
        }
      }
    }
  }
  console.log(`Found ${suspectedDuplicates.length} suspected duplicate pairs.`);

  // Build the workbook
  console.log("Writing XLSX...");
  const wb = new ExcelJS.Workbook();

  // Standard column layout used across all sheets — reused via spread
  const standardColumns = [
    { header: "Make", key: "make", width: 22 },
    { header: "Model", key: "model", width: 35 },
    { header: "Full Title", key: "title", width: 45 },
    { header: "Canonical Product ID", key: "productId", width: 28 },
    { header: "Slug", key: "slug", width: 35 },
    { header: "Has Price Guide", key: "hasPriceGuide", width: 16 },
    { header: "Reverb PG Transactions", key: "txnCount", width: 22 },
    { header: "FMV", key: "fmv", width: 12 },
    { header: "Buy Price", key: "buyPrice", width: 12 },
    { header: "Reverb PG Hist Price", key: "reverbPgHistPrice", width: 18 },
    { header: "Reverb Market Sold Price", key: "reverbMarketSoldPrice", width: 22 },
    { header: "Reverb PG Low", key: "lowPrice", width: 14 },
    { header: "Reverb PG High", key: "highPrice", width: 14 },
    { header: "Last Sold At", key: "lastSoldAt", width: 14 },
    { header: "Reverb PG Link", key: "reverbPgLink", width: 50 },
    { header: "Reverb Market Sold Link", key: "reverbMarketSoldLink", width: 50 },
  ];
  const STANDARD_COL_COUNT = standardColumns.length;

  function rowToStandard(r) {
    return {
      make: r.make,
      model: r.model,
      title: r.title,
      productId: r.productId,
      slug: r.slug,
      hasPriceGuide: r.hasPriceGuide,
      txnCount: r.txnCount,
      fmv: r.fmv,
      buyPrice: r.buyPrice,
      reverbPgHistPrice: r.reverbPgHistPrice,
      reverbMarketSoldPrice: r.reverbMarketSoldPrice,
      lowPrice: r.lowPrice,
      highPrice: r.highPrice,
      lastSoldAt: r.lastSoldAt,
      reverbPgLink: r.reverbPgLink,
      reverbMarketSoldLink: r.reverbMarketSoldLink,
    };
  }

  // Sheet 1: All pedals
  const ws1 = wb.addWorksheet("All Pedals");
  ws1.columns = standardColumns.map((c) => ({ ...c }));
  for (const r of rows) ws1.addRow(rowToStandard(r));
  ws1.getRow(1).font = { bold: true };
  ws1.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF305496" } };
  ws1.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
  ws1.views = [{ state: "frozen", ySplit: 1 }];

  // Build "duplicate groups" — each unique pedal becomes 1 row.
  // The primary pedal occupies the standard columns; duplicates extend to the right.
  // Definite Duplicates: groups of exact normalized matches (≥2 in group).
  // Pick the highest-transaction-count entry as the primary for each group.
  const dupGroupsMap = new Map();
  for (const r of definiteDuplicates) {
    if (!dupGroupsMap.has(r.dupGroup)) dupGroupsMap.set(r.dupGroup, []);
    dupGroupsMap.get(r.dupGroup).push(r);
  }
  const dupGroups = [];
  for (const group of dupGroupsMap.values()) {
    const sorted = group.slice().sort((a, b) => (b.txnCount || 0) - (a.txnCount || 0));
    dupGroups.push({ primary: sorted[0], duplicates: sorted.slice(1) });
  }
  // Sort groups: largest first
  dupGroups.sort((a, b) => (b.duplicates.length + 1) - (a.duplicates.length + 1));

  // Determine the max number of duplicate columns needed
  const maxDupsDefinite = Math.max(0, ...dupGroups.map((g) => g.duplicates.length));

  // Sheet 2: Definite Duplicates — primary row, duplicates extending right
  const ws2 = wb.addWorksheet("Definite Duplicates");
  const dupColumnsDefinite = [];
  for (let i = 1; i <= maxDupsDefinite; i++) {
    dupColumnsDefinite.push({ header: `Dup ${i} Make`, key: `d${i}_make`, width: 22 });
    dupColumnsDefinite.push({ header: `Dup ${i} Model`, key: `d${i}_model`, width: 30 });
    dupColumnsDefinite.push({ header: `Dup ${i} Title`, key: `d${i}_title`, width: 40 });
    dupColumnsDefinite.push({ header: `Dup ${i} Product ID`, key: `d${i}_productId`, width: 28 });
    dupColumnsDefinite.push({ header: `Dup ${i} Reverb PG Transactions`, key: `d${i}_txnCount`, width: 14 });
  }
  ws2.columns = [...standardColumns.map((c) => ({ ...c })), ...dupColumnsDefinite];
  for (const g of dupGroups) {
    const row = rowToStandard(g.primary);
    g.duplicates.forEach((d, idx) => {
      const i = idx + 1;
      row[`d${i}_make`] = d.make;
      row[`d${i}_model`] = d.model;
      row[`d${i}_title`] = d.title;
      row[`d${i}_productId`] = d.productId;
      row[`d${i}_txnCount`] = d.txnCount;
    });
    ws2.addRow(row);
  }
  ws2.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
  ws2.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF305496" } };
  ws2.views = [{ state: "frozen", ySplit: 1, xSplit: STANDARD_COL_COUNT }];

  // Sheet 3: Suspected Duplicates — group by primary product, list suspected duplicates to the right.
  // Build adjacency from suspectedDuplicates pairs: for each product, collect list of similar products.
  const suspectedByProductId = new Map();
  for (const pair of suspectedDuplicates) {
    if (!suspectedByProductId.has(pair.productIdA)) suspectedByProductId.set(pair.productIdA, []);
    if (!suspectedByProductId.has(pair.productIdB)) suspectedByProductId.set(pair.productIdB, []);
    suspectedByProductId.get(pair.productIdA).push({
      make: pair.make, model: pair.modelB, title: pair.titleB,
      productId: pair.productIdB, txnCount: pair.txnCountB,
    });
    suspectedByProductId.get(pair.productIdB).push({
      make: pair.make, model: pair.modelA, title: pair.titleA,
      productId: pair.productIdA, txnCount: pair.txnCountA,
    });
  }
  // For each primary product (the one with higher txn count in any pair it appears in),
  // build a row. To avoid duplicating rows, only include a product as primary if it's the
  // one with the highest txn count among its similar set.
  const rowByProductId = new Map();
  for (const r of rows) rowByProductId.set(r.productId, r);

  const suspectedRows = [];
  const usedAsSecondary = new Set();
  // Sort product IDs by txn count desc so the highest-popularity primaries get listed first
  const candidateIds = [...suspectedByProductId.keys()].sort((a, b) => {
    const ta = (rowByProductId.get(a)?.txnCount) || 0;
    const tb = (rowByProductId.get(b)?.txnCount) || 0;
    return tb - ta;
  });

  for (const id of candidateIds) {
    if (usedAsSecondary.has(id)) continue;
    const primary = rowByProductId.get(id);
    if (!primary) continue;
    const similar = (suspectedByProductId.get(id) || []).filter((s) => !usedAsSecondary.has(s.productId));
    if (similar.length === 0) continue;
    // Dedupe similar by productId
    const seen = new Set();
    const uniqueSimilar = [];
    for (const s of similar) {
      if (seen.has(s.productId)) continue;
      seen.add(s.productId);
      uniqueSimilar.push(s);
    }
    suspectedRows.push({ primary, similar: uniqueSimilar });
    for (const s of uniqueSimilar) usedAsSecondary.add(s.productId);
  }
  const maxDupsSuspected = Math.max(0, ...suspectedRows.map((r) => r.similar.length));

  const ws3 = wb.addWorksheet("Suspected Duplicates");
  const dupColumnsSuspected = [];
  for (let i = 1; i <= maxDupsSuspected; i++) {
    dupColumnsSuspected.push({ header: `Suspect ${i} Make`, key: `s${i}_make`, width: 22 });
    dupColumnsSuspected.push({ header: `Suspect ${i} Model`, key: `s${i}_model`, width: 30 });
    dupColumnsSuspected.push({ header: `Suspect ${i} Title`, key: `s${i}_title`, width: 40 });
    dupColumnsSuspected.push({ header: `Suspect ${i} Product ID`, key: `s${i}_productId`, width: 28 });
    dupColumnsSuspected.push({ header: `Suspect ${i} Reverb PG Transactions`, key: `s${i}_txnCount`, width: 14 });
  }
  ws3.columns = [...standardColumns.map((c) => ({ ...c })), ...dupColumnsSuspected];
  for (const r of suspectedRows) {
    const row = rowToStandard(r.primary);
    r.similar.forEach((s, idx) => {
      const i = idx + 1;
      row[`s${i}_make`] = s.make;
      row[`s${i}_model`] = s.model;
      row[`s${i}_title`] = s.title;
      row[`s${i}_productId`] = s.productId;
      row[`s${i}_txnCount`] = s.txnCount;
    });
    ws3.addRow(row);
  }
  ws3.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
  ws3.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF305496" } };
  ws3.views = [{ state: "frozen", ySplit: 1, xSplit: STANDARD_COL_COUNT }];

  // Sheet 4: All Pedals with Definite Duplicates consolidated.
  // Every unique pedal gets its own row. Definite duplicates merge into the primary row's right-side columns.
  const definitePrimaryIds = new Set(dupGroups.map((g) => g.primary.productId));
  const definiteSecondaryIds = new Set();
  for (const g of dupGroups) g.duplicates.forEach((d) => definiteSecondaryIds.add(d.productId));

  const ws4 = wb.addWorksheet("All Pedals (Definite Merged)");
  const dupColumns4 = [];
  for (let i = 1; i <= maxDupsDefinite; i++) {
    dupColumns4.push({ header: `Dup ${i} Make`, key: `d${i}_make`, width: 22 });
    dupColumns4.push({ header: `Dup ${i} Model`, key: `d${i}_model`, width: 30 });
    dupColumns4.push({ header: `Dup ${i} Title`, key: `d${i}_title`, width: 40 });
    dupColumns4.push({ header: `Dup ${i} Product ID`, key: `d${i}_productId`, width: 28 });
    dupColumns4.push({ header: `Dup ${i} Reverb PG Transactions`, key: `d${i}_txnCount`, width: 14 });
  }
  ws4.columns = [...standardColumns.map((c) => ({ ...c })), ...dupColumns4];

  // Build a lookup of primary → duplicates for fast access
  const primaryToDuplicates = new Map();
  for (const g of dupGroups) primaryToDuplicates.set(g.primary.productId, g.duplicates);

  let sheet4Count = 0;
  for (const r of rows) {
    if (definiteSecondaryIds.has(r.productId)) continue; // skip duplicates, they merge into primary
    const row = rowToStandard(r);
    if (definitePrimaryIds.has(r.productId)) {
      const dups = primaryToDuplicates.get(r.productId) || [];
      dups.forEach((d, idx) => {
        const i = idx + 1;
        row[`d${i}_make`] = d.make;
        row[`d${i}_model`] = d.model;
        row[`d${i}_title`] = d.title;
        row[`d${i}_productId`] = d.productId;
        row[`d${i}_txnCount`] = d.txnCount;
      });
    }
    ws4.addRow(row);
    sheet4Count++;
  }
  ws4.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
  ws4.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF305496" } };
  ws4.views = [{ state: "frozen", ySplit: 1, xSplit: STANDARD_COL_COUNT }];

  // Sheet 5: All Pedals with Suspected Duplicates consolidated.
  const suspectedPrimaryIds = new Set(suspectedRows.map((r) => r.primary.productId));
  const suspectedSecondaryIds = new Set();
  for (const r of suspectedRows) r.similar.forEach((s) => suspectedSecondaryIds.add(s.productId));

  const ws5 = wb.addWorksheet("All Pedals (Suspected Merged)");
  const dupColumns5 = [];
  for (let i = 1; i <= maxDupsSuspected; i++) {
    dupColumns5.push({ header: `Suspect ${i} Make`, key: `s${i}_make`, width: 22 });
    dupColumns5.push({ header: `Suspect ${i} Model`, key: `s${i}_model`, width: 30 });
    dupColumns5.push({ header: `Suspect ${i} Title`, key: `s${i}_title`, width: 40 });
    dupColumns5.push({ header: `Suspect ${i} Product ID`, key: `s${i}_productId`, width: 28 });
    dupColumns5.push({ header: `Suspect ${i} Reverb PG Transactions`, key: `s${i}_txnCount`, width: 14 });
  }
  ws5.columns = [...standardColumns.map((c) => ({ ...c })), ...dupColumns5];

  const primaryToSuspected = new Map();
  for (const r of suspectedRows) primaryToSuspected.set(r.primary.productId, r.similar);

  let sheet5Count = 0;
  for (const r of rows) {
    if (suspectedSecondaryIds.has(r.productId)) continue;
    const row = rowToStandard(r);
    if (suspectedPrimaryIds.has(r.productId)) {
      const sims = primaryToSuspected.get(r.productId) || [];
      sims.forEach((s, idx) => {
        const i = idx + 1;
        row[`s${i}_make`] = s.make;
        row[`s${i}_model`] = s.model;
        row[`s${i}_title`] = s.title;
        row[`s${i}_productId`] = s.productId;
        row[`s${i}_txnCount`] = s.txnCount;
      });
    }
    ws5.addRow(row);
    sheet5Count++;
  }
  ws5.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
  ws5.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF305496" } };
  ws5.views = [{ state: "frozen", ySplit: 1, xSplit: STANDARD_COL_COUNT }];

  const outDir = path.join(__dirname, "..", "logs");
  fs.mkdirSync(outDir, { recursive: true });
  const stamp = new Date().toISOString().slice(0, 10);
  const outPath = path.join(outDir, `reverb-db-export-${stamp}.xlsx`);
  await wb.xlsx.writeFile(outPath);

  console.log(`\n✓ Wrote ${outPath}`);
  console.log(`  Sheet 1 (All Pedals):                            ${rows.length} rows`);
  console.log(`  Sheet 2 (Definite Duplicates only):              ${dupGroups.length} groups`);
  console.log(`  Sheet 3 (Suspected Duplicates only):             ${suspectedRows.length} groups`);
  console.log(`  Sheet 4 (All Pedals, Definite Merged):           ${sheet4Count} rows`);
  console.log(`  Sheet 5 (All Pedals, Suspected Merged):          ${sheet5Count} rows`);

  await mongoose.disconnect();
  process.exit(0);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
