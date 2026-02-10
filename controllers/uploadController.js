const XLSX = require("xlsx");
const Calculation = require("../model/calculation.mdl");
const { findMatchingProduct } = require("../services/matching");
const { calculatePriceFromTransactions, calculateOffer, calculatePtmSellPrice } = require("../utils/pricing");
const { buildReverbPgLink, buildReverbMarketSoldLink } = require("../utils/reverb");

const uploadFile = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    const workbook = XLSX.read(req.file.buffer, { type: "buffer" });
    
    if (!workbook.SheetNames || workbook.SheetNames.length === 0) {
      return res.status(400).json({ error: "Spreadsheet is empty or invalid" });
    }
    
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    
    if (!worksheet) {
      return res.status(400).json({ error: "Spreadsheet sheet is invalid" });
    }
    
    const data = XLSX.utils.sheet_to_json(worksheet);

    if (!data || data.length === 0) {
      return res.status(400).json({ error: "Spreadsheet contains no data rows" });
    }

    // Expected format: Name/Person, Pedal, Condition (or variations)
    // Also handle files downloaded from this app which use "Person" column
    const processedData = [];

    for (const row of data) {
      // Try multiple column name variations for person name
      const name = row.Name || row.name || row["Person Name"] || row.Person || row.person || "";
      // Try multiple column name variations for pedal
      const pedal = row.Pedal || row.pedal || row["Pedal Name"] || "";
      // Try multiple column name variations for condition
      const condition =
        row.Condition ||
        row.condition ||
        row["Pedal Condition"] ||
        "Unknown";

      // Skip rows that are totals or special rows
      if (pedal && (pedal.toString().toUpperCase() === "TOTAL" || pedal.toString().toUpperCase() === "OFFER")) {
        continue;
      }

      if (name && pedal) {
        processedData.push({ name, pedal, condition });
      }
    }

    if (processedData.length === 0) {
      // Provide helpful error message with available column names
      const availableColumns = data.length > 0 ? Object.keys(data[0]).join(", ") : "none";
      return res.status(400).json({ 
        error: `No valid data found in spreadsheet. Found columns: ${availableColumns}. Please ensure columns include 'Name'/'Person'/'Person Name' and 'Pedal'/'Pedal Name'` 
      });
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
      });
    }

    // Get prices for all pedals
    const allResults = {};

    for (const [personName, pedals] of Object.entries(peopleData)) {
      const pedalResults = [];

      for (const { pedal, condition } of pedals) {
        const product = await findMatchingProduct(pedal, condition);

        if (product) {
          const price = calculatePriceFromTransactions(product, condition);
          const reverbPgHistPrice = price;
          const reverbPgLink = buildReverbPgLink(product);
          const reverbMarketSoldPrice = product.reverbMarketSoldPrice ?? null;
          const reverbMarketSoldLink = product.reverbMarketSoldLink ?? buildReverbMarketSoldLink(product);
          const ptmBuyPrice = product.ptmBuyPrice != null ? product.ptmBuyPrice : null;
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
