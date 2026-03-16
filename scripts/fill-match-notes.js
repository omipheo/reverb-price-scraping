#!/usr/bin/env node
/**
 * Read MATCHES_TO_REVIEW.csv, add reverb_search_url, fill correct_YN_notes
 * for known wrong/correct matches. Run: node scripts/fill-match-notes.js
 */
const fs = require("fs");
const path = require("path");

const csvPath = path.join(__dirname, "..", "MATCHES_TO_REVIEW.csv");
const outPath = path.join(__dirname, "..", "MATCHES_TO_REVIEW.csv");

const content = fs.readFileSync(csvPath, "utf8");
const lines = content.split(/\r?\n/);
if (lines.length < 2) {
  console.error("No data rows");
  process.exit(1);
}

const header = lines[0];
if (!header.includes("correct_YN_notes")) {
  console.error("Expected correct_YN_notes column");
  process.exit(1);
}

// Known wrong: input pattern or (input, matched) -> note
const wrongMatches = new Map([
  ["BC Soul Vibe", "N: wrong match; should be BBE Soul Vibe"],
  ["eqd plumes", "N: wrong match; should be EarthQuaker Plumes not ZEQD-Pre"],
  ["JHS Colourbox V2", "N: wrong match; should be JHS Colourbox not Summing Amp"],
  ["JET Micro", "N: wrong match; likely different product than Infinite Jets"],
  ["eqd special cranker", "N: wrong match; matched to ZEQD-Pre"],
  ["Eqd avalanche run", "N: wrong match; matched to ZEQD-Pre"],
  ["Eqd hizumitas", "N: wrong match; matched to ZEQD-Pre"],
  ["Eqd Swiss things", "N: wrong match; matched to ZEQD-Pre"],
  ["EQD Sea Machine", "N: wrong match; matched to ZEQD-Pre"],
  ["Kelly Hydra", "N: wrong match; matched to guitar case"],
  ["fish delay reverb", "N: verify; matched to Fishman AFX Delay"],
  ["Hohner Tri Dirty Booster", "N: wrong match; matched to Hohner guitar"],
  ["Electric warp factory", "N: wrong match; matched to strings"],
  ["Mooer Wha-Wha", "N: wrong match; matched to Yellow Comp"],
  ["Kittycaster Mohair", "N: wrong match"],
  ["Catalinbread Katzenkonig", "N: wrong match"],
  ["VFE Alphadog V2", "N: wrong match"],
  ["Zoom Trimetal", "N: wrong match; different Zoom model"],
  ["God City Instruments Brutalist", "N: wrong match; matched to Godin guitar"],
  ["Electrostatic mono synth", "N: wrong match; matched to headphones"],
  ["electromatic B9", "N: wrong match; matched to Gretsch part"],
  ["science ampllification mother", "N: wrong match; matched to book"],
  ["jhs bonzai", "N: wrong match; should be JHS Bonsai not Summing Amp"],
  ["Full tone Clyde Crybaby", "N: wrong match; matched to Full Drive 2"],
  ["Voodo Labs Microvibe", "N: wrong match; matched to Joyo Voodoo Octave"],
  ["dunlop univibe/chorus/vibralto", "N: wrong match; matched to strap retainer"],
  ["Electro Harmonics- B9", "N: wrong match; B9 vs Small Clone"],
  ["EHX Hot Shot A-B switcher", "N: wrong match; matched to tuner"],
  ["ehx dmm big box", "N: wrong match; should be Deluxe Memory Man"],
  ["ehx black russian big muff", "N: wrong match; should be Big Muff"],
  ["EHX Glove", "N: wrong match; matched to tuner"],
  ["ehx small stone", "N: wrong match; should be Small Stone phaser"],
  ["EHX Voice Box", "N: wrong match; matched to tuner"],
  ["EHX Superego", "N: wrong match; should be Superego"],
  ["EHX Epitome", "N: wrong match; matched to tuner"],
  ["EHX Worm", "N: wrong match; matched to tuner"],
  ["EHX Crayon", "N: wrong match; matched to tuner"],
  ["EHX Silencer", "N: wrong match; matched to tuner"],
  ["EHX Soul Food JHS mod", "N: wrong match; matched to tuner"],
  ["ehx tri parallel mixer", "N: wrong match; matched to tuner"],
  ["Boss RC-3", "N: wrong match; matched to RC-300"],
  ["boss rc-3", "N: wrong match; matched to RC-300"],
  ["Dunlop Cry Baby", "N: verify; matched to Bass Wah not standard Cry Baby"],
  ["Cry Baby Wah", "N: verify; matched to Bass Wah"],
  ["friedman beod", "N: wrong match; matched to Smallbox not BE-OD"],
  ["hughes and kettner tube rotosphere", "N: wrong match; matched to GrandMeister amp"],
  ["Xotic compressor x 2", "N: wrong match; matched to RC Booster"],
  ["One Series Gemini Chorus w/pwr", "N: wrong match; matched to Fulltone OCD"],
  ["Keeley Modified Line 6 modulation", "N: wrong match"],
]);
// Boss BCB-30 is a pedalboard; wrong when input is a different Boss pedal
const wrongIfMatchedBcb30 = ["Boss dd200", "Boss ES5", "boss dd20", "boss re2", "Boss RC-3", "boss rc-3"];
wrongIfMatchedBcb30.forEach((k) => wrongMatches.set(k, "N: wrong match; matched to Boss BCB-30 pedalboard"));

// EHX tuner bug: any EHX pedal that matched to EHX-2020 Tuner is wrong (except if input is tuner)
const ehxTunerWrong = "N: wrong match; EHX matcher bug (matched to tuner)";

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

const outputLines = [];
// New header: add reverb_search_url after matched_product
const headerCols = parseCsvLine(header);
const idxInput = headerCols.indexOf("input");
const idxMatched = headerCols.indexOf("matched_product");
const idxNotes = headerCols.indexOf("correct_YN_notes");
if (idxInput === -1 || idxNotes === -1) {
  console.error("Missing input or correct_YN_notes column");
  process.exit(1);
}
// Keep header as-is but we'll add reverb column in output
const newHeader = "input,matched_product,pg_price,market_sold,ptm_sell,reverb_search_url,correct_YN_notes";
outputLines.push(newHeader);

for (let i = 1; i < lines.length; i++) {
  const line = lines[i];
  if (!line.trim()) continue;
  const cols = parseCsvLine(line);
  const input = (cols[idxInput] || "").replace(/^"|"$/g, "");
  const matched = (cols[idxMatched] || "").replace(/^"|"$/g, "");
  const pg = cols[2] !== undefined ? cols[2].replace(/^"|"$/g, "") : "";
  const sold = cols[3] !== undefined ? cols[3].replace(/^"|"$/g, "") : "";
  const ptm = cols[4] !== undefined ? cols[4].replace(/^"|"$/g, "") : "";
  let notes = (cols[idxNotes] || "").replace(/^"|"$/g, "");

  const reverbQuery = encodeURIComponent(input).replace(/%20/g, "+");
  const reverbUrl = `https://reverb.com/marketplace?query=${reverbQuery}&product_type=effects-and-pedals`;

  if (!notes) {
    if (wrongMatches.has(input)) {
      notes = wrongMatches.get(input);
    } else if (matched === "Electro-Harmonix EHX-2020 Pedal Tuner" && !/tuner|2020/i.test(input)) {
      notes = ehxTunerWrong;
    } else if (matched === "Boss BCB-30 Compact Pedal Board" && wrongIfMatchedBcb30.some((k) => input === k)) {
      notes = wrongMatches.get(input);
    } else if (input && matched && input.toLowerCase().replace(/\s+/g, " ") === matched.toLowerCase().replace(/\s+/g, " ").slice(0, input.length + 5)) {
      notes = "Y";
    } else if (matched.startsWith(input.split(" ")[0]) && matched.toLowerCase().includes(input.toLowerCase().split(" ").slice(0, 2).join(" "))) {
      notes = "Y";
    }
  }

  const escape = (s) => `"${(s == null ? "" : String(s)).replace(/"/g, '""')}"`;
  outputLines.push([escape(input), escape(matched), escape(pg), escape(sold), escape(ptm), escape(reverbUrl), escape(notes)].join(","));
}

fs.writeFileSync(outPath, outputLines.join("\n"), "utf8");
console.log("Updated", outPath);
console.log("Added reverb_search_url; filled correct_YN_notes for", outputLines.filter((l) => l.includes("N:")).length, "wrong matches");
process.exit(0);
