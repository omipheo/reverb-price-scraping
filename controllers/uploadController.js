const fs = require("fs");
const path = require("path");
const os = require("os");
const { spawnSync } = require("child_process");
const XLSX = require("xlsx");
const Calculation = require("../model/calculation.mdl");
const { findMatchingProduct } = require("../services/matching");
const { calculatePriceFromTransactions, calculateOffer, calculatePtmSellPrice } = require("../utils/pricing");
const { buildReverbPgLink, buildReverbMarketSoldLink } = require("../utils/reverb");

const SCRIPT_DIR = path.join(__dirname, "..", "scripts");
const CLEAN_SCRIPT = path.join(SCRIPT_DIR, "clean-pedal-pricing.py");

/**
 * If cleanAsJustin is true, run the Python cleaner on the uploaded xlsx and return
 * parsed rows { name, pedal, condition, ptmBuyFromSheet } from the cleaned CSV.
 * Otherwise returns null (caller will parse from workbook).
 */
function cleanJustinAndParse(req) {
  const cleanAsJustin = req.body && (req.body.cleanAsJustin === "true" || req.body.cleanAsJustin === true);
  if (!cleanAsJustin || !req.file) return null;
  const buf = req.file.buffer;
  const isXlsx = /\.xlsx$/i.test(req.file.originalname || "");
  if (!isXlsx) {
    return { error: "Clean as Justin spreadsheet requires an .xlsx file." };
  }

  const tmpDir = os.tmpdir();
  const inputPath = path.join(tmpDir, `justin-upload-${Date.now()}.xlsx`);
  const outputPath = path.join(tmpDir, `justin-cleaned-${Date.now()}.csv`);

  try {
    fs.writeFileSync(inputPath, buf);
  } catch (e) {
    return { error: "Failed to write temporary file." };
  }

  const python = process.platform === "win32" ? "python" : "python3";
  const result = spawnSync(python, [CLEAN_SCRIPT, "--input", inputPath, "--output", outputPath], {
    cwd: path.join(__dirname, ".."),
    encoding: "utf8",
    timeout: 120000,
  });

  try {
    if (fs.existsSync(inputPath)) fs.unlinkSync(inputPath);
  } catch (_) {}

  if (result.error) {
    return {
      error: "Python is required to clean the Justin spreadsheet. Install Python 3 and pandas/openpyxl, or upload an already-cleaned file.",
    };
  }
  if (result.status !== 0) {
    const stderr = (result.stderr || "").trim() || (result.stdout || "").trim();
    try {
      if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
    } catch (_) {}
    return {
      error: stderr ? `Clean script failed: ${stderr}` : "Clean script failed. Ensure the file is a valid Justin pricing spreadsheet.",
    };
  }

  let csvContent;
  try {
    csvContent = fs.readFileSync(outputPath, "utf8");
  } finally {
    try {
      if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
    } catch (_) {}
  }

  // CSV columns: pedal_name, condition, price
  const lines = csvContent.split(/\r?\n/).filter((l) => l.trim());
  const processedData = [];
  const header = lines[0];
  if (!header || !header.toLowerCase().includes("pedal_name")) {
    return { error: "Cleaned output missing pedal_name column." };
  }
  const cols = header.split(",").map((c) => c.trim().toLowerCase());
  const idxName = cols.indexOf("pedal_name");
  const idxCond = cols.indexOf("condition");
  const idxPrice = cols.indexOf("price");
  if (idxName === -1) {
    return { error: "Cleaned output missing pedal_name column." };
  }
  for (let i = 1; i < lines.length; i++) {
    const parts = parseCsvLine(lines[i]);
    const pedal = idxName >= 0 && parts[idxName] != null ? String(parts[idxName]).trim() : "";
    const condition = idxCond >= 0 && parts[idxCond] != null ? String(parts[idxCond]).trim() : "Unknown";
    let ptmBuyFromSheet = null;
    if (idxPrice >= 0 && parts[idxPrice] != null) {
      const p = parseFloat(String(parts[idxPrice]).replace(/[^0-9.-]/g, ""));
      if (Number.isFinite(p) && p > 0) ptmBuyFromSheet = p;
    }
    if (pedal) {
      processedData.push({
        name: "Justin",
        pedal,
        condition,
        ptmBuyFromSheet,
      });
    }
  }
  return { processedData };
}

function parseCsvLine(line) {
  const out = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      inQuotes = !inQuotes;
    } else if ((c === "," && !inQuotes) || c === "\n" || c === "\r") {
      out.push(cur.trim());
      cur = "";
    } else {
      cur += c;
    }
  }
  out.push(cur.trim());
  return out;
}

const uploadFile = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    let data;
    let processedData = null;

    const justinResult = cleanJustinAndParse(req);
    if (justinResult && justinResult.error) {
      return res.status(400).json({ error: justinResult.error });
    }
    if (justinResult && justinResult.processedData) {
      processedData = justinResult.processedData;
    }

    if (!processedData) {
      const workbook = XLSX.read(req.file.buffer, { type: "buffer" });
      if (!workbook.SheetNames || workbook.SheetNames.length === 0) {
        return res.status(400).json({ error: "Spreadsheet is empty or invalid" });
      }
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      if (!worksheet) {
        return res.status(400).json({ error: "Spreadsheet sheet is invalid" });
      }
      data = XLSX.utils.sheet_to_json(worksheet);
      if (!data || data.length === 0) {
        return res.status(400).json({ error: "Spreadsheet contains no data rows" });
      }

      // Expected format: Name/Person, Pedal, Condition (or variations)
      processedData = [];

    for (const row of data) {
      const name = row.Name || row.name || row["Person Name"] || row.Person || row.person || "";
      const pedal = row.Pedal || row.pedal || row["Pedal Name"] || row.pedal_name || "";
      // person/pedal_name/price = columns from cleaned "justin pricing spreadsheet.xlsx" output
      const condition =
        row.Condition ||
        row.condition ||
        row["Pedal Condition"] ||
        "Unknown";
      // Optional: PTM Buy / Justin price (from justin pricing spreadsheet.xlsx cleaned output or similar)
      const buyFromSheet = row["PTM Buy Price"] ?? row["ptmBuyPrice"] ?? row["Justin price"] ?? row["Justin Price"] ?? row["Buy Price"] ?? row["Price"] ?? row.price ?? null;
      const ptmBuyFromSheet = buyFromSheet != null && buyFromSheet !== "" ? parseFloat(String(buyFromSheet).replace(/[^0-9.-]/g, "")) : null;
      const hasValidBuy = Number.isFinite(ptmBuyFromSheet) && ptmBuyFromSheet > 0;

      if (pedal && (pedal.toString().toUpperCase() === "TOTAL" || pedal.toString().toUpperCase() === "OFFER")) {
        continue;
      }

      if (name && pedal) {
        processedData.push({ name, pedal, condition, ptmBuyFromSheet: hasValidBuy ? ptmBuyFromSheet : null });
      }
    }

      if (processedData.length === 0) {
        if (data) {
          const availableColumns = data.length > 0 ? Object.keys(data[0]).join(", ") : "none";
          return res.status(400).json({
            error: `No valid data found in spreadsheet. Found columns: ${availableColumns}. Please ensure columns include 'Name'/'Person'/'Pedal' (or use "Clean as Justin" for raw Justin spreadsheet).`,
          });
        }
        return res.status(400).json({ error: "No valid rows after cleaning the Justin spreadsheet." });
      }
    }

    if (processedData.length === 0) {
      return res.status(400).json({ error: "No valid rows to process." });
    }

    // Group by person
    const peopleData = {};
    for (const item of processedData) {
      if (!peopleData[item.name]) {
        peopleData[item.name] = [];
      }
      peopleData[item.name].push({
        pedal: item.pedal,
        condition: item.condition,
        ptmBuyFromSheet: item.ptmBuyFromSheet,
      });
    }

    // Get prices for all pedals
    const allResults = {};

    for (const [personName, pedals] of Object.entries(peopleData)) {
      const pedalResults = [];

      for (const { pedal, condition, ptmBuyFromSheet } of pedals) {
        const product = await findMatchingProduct(pedal, condition);

        if (product) {
          const price = calculatePriceFromTransactions(product, condition);
          const reverbPgHistPrice = price;
          const reverbPgLink = buildReverbPgLink(product);
          const reverbMarketSoldPrice = product.reverbMarketSoldPrice ?? null;
          const reverbMarketSoldLink = product.reverbMarketSoldLink ?? buildReverbMarketSoldLink(product);
          const ptmBuyPrice = ptmBuyFromSheet ?? product.ptmBuyPrice;
          const ptmBuyPriceExpiresAt = product.ptmBuyPriceExpiresAt || null;
          const expStr = ptmBuyPriceExpiresAt ? (ptmBuyPriceExpiresAt.toISOString ? ptmBuyPriceExpiresAt.toISOString().slice(0, 10) : ptmBuyPriceExpiresAt) : null;
          const ptmSellPrice = product.ptmSellPrice != null ? product.ptmSellPrice : calculatePtmSellPrice(product);
          const ptmSellPriceExpiresAt = product.ptmSellPriceExpiresAt || null;
          const sellExpStr = ptmSellPriceExpiresAt ? (ptmSellPriceExpiresAt.toISOString ? ptmSellPriceExpiresAt.toISOString().slice(0, 10) : ptmSellPriceExpiresAt) : null;

          if (price !== null) {
            const offer = calculateOffer(price);

            pedalResults.push({
              pedal,
              condition,
              matchedProduct: product.title,
              brand: product.brand,
              price,
              offer,
              hasPriceGuide: true,
              reverbPgHistPrice,
              reverbPgLink,
              reverbMarketSoldPrice,
              reverbMarketSoldLink,
              amtListedOnReverbMarket: null,
              ptmBuyPrice,
              ptmBuyPriceExpiresAt: expStr,
              productId: product.canonicalProductId,
              buyPrice: product.buyPrice != null ? product.buyPrice : null,
              ptmSellPrice,
              ptmSellPriceExpiresAt: sellExpStr,
              noMatch: false,
              partialMatch: false,
            });
          } else {
            pedalResults.push({
              pedal,
              condition,
              matchedProduct: product.title,
              brand: product.brand,
              price: null,
              offer: 0,
              hasPriceGuide: false,
              reverbPgHistPrice: null,
              reverbPgLink,
              reverbMarketSoldPrice,
              reverbMarketSoldLink,
              amtListedOnReverbMarket: null,
              ptmBuyPrice,
              ptmBuyPriceExpiresAt: expStr,
              productId: product.canonicalProductId,
              buyPrice: product.buyPrice != null ? product.buyPrice : null,
              ptmSellPrice,
              ptmSellPriceExpiresAt: sellExpStr,
              noMatch: false,
              partialMatch: false,
            });
          }
        } else {
          pedalResults.push({
            pedal,
            condition,
            matchedProduct: null,
            brand: null,
            price: null,
            offer: 0,
            hasPriceGuide: false,
            reverbPgHistPrice: null,
            reverbPgLink: null,
            reverbMarketSoldPrice: null,
            reverbMarketSoldLink: null,
            amtListedOnReverbMarket: null,
            ptmBuyPrice: null,
            ptmBuyPriceExpiresAt: null,
            productId: null,
            buyPrice: null,
            ptmSellPrice: null,
            ptmSellPriceExpiresAt: null,
            noMatch: true,
            partialMatch: false,
          });
        }
      }

      // Sort by price (lowest to highest)
      pedalResults.sort((a, b) => {
        if (!a.price && !b.price) return 0;
        if (!a.price) return 1;
        if (!b.price) return -1;
        return a.price - b.price;
      });

      // FMV = sum of PTM Buy Prices only
      const totalPrice = pedalResults.reduce(
        (sum, p) => sum + (p.ptmBuyPrice != null ? p.ptmBuyPrice : 0),
        0
      );
      const totalOffer = calculateOffer(totalPrice);

      allResults[personName] = {
        pedals: pedalResults,
        totalPrice,
        totalOffer,
      };
    }

    // Calculate overall totals
    const overallTotalPrice = Object.values(allResults).reduce(
      (sum, p) => sum + (p.totalPrice || 0),
      0
    );
    const overallTotalOffer = Object.values(allResults).reduce(
      (sum, p) => sum + (p.totalOffer || 0),
      0
    );

    // Save calculation to database
    const calculation = new Calculation({
      userId: req.session.userId,
      title: req.body.title || `File Upload ${new Date().toLocaleString()}`,
      inputType: "file",
      inputData: { filename: req.file.originalname, processedData },
      results: allResults,
      totalPrice: overallTotalPrice,
      totalOffer: overallTotalOffer,
    });
    await calculation.save();

    res.json({ 
      results: allResults,
      calculationId: calculation._id,
      totalPrice: overallTotalPrice,
      totalOffer: overallTotalOffer,
    });
  } catch (error) {
    console.error("Error in /api/upload:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

module.exports = {
  uploadFile,
};
