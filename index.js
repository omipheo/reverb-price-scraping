require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const path = require("path");
const Product = require("./model/product.mdl");
const XLSX = require("xlsx");
const fs = require("fs");
const multer = require("multer");

const app = express();
const PORT = process.env.PORT || 3000;
const MONGO_URI = process.env.MONGO_URI || "mongodb://127.0.0.1:27017/pedal_prices_v2";

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public")));

// Configure multer for file uploads
const upload = multer({ storage: multer.memoryStorage() });

// Connect to MongoDB
mongoose
  .connect(MONGO_URI)
  .then(() => {
    console.log("✅ MongoDB connected:", MONGO_URI);
  })
  .catch((err) => {
    console.error("❌ MongoDB connection error:", err);
    process.exit(1);
  });

// Utility: Normalize pedal name for matching
function normalizePedalName(name) {
  return (name || "")
    .toLowerCase()
    .replace(/\b(excellent|very good|good|fair|poor|mint|b-stock|demo)\b/gi, " ")
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Utility: Calculate offer based on price
function calculateOffer(price) {
  if (!price || price <= 0) return 0;
  if (price <= 69) return 20;
  if (price <= 199) return Math.round(price * 0.7);
  return Math.round(price * 0.75);
}

// Utility: Find best matching product in MongoDB
async function findMatchingProduct(pedalName, condition = null) {
  const normalized = normalizePedalName(pedalName);
  const searchTerms = normalized.split(" ").filter((t) => t.length > 2);

  // Try exact match first
  let product = await Product.findOne({
    normalizedTitle: normalized,
    hasPriceGuide: true,
  });

  if (product) return product;

  // Try fuzzy match using search terms
  const regexPattern = searchTerms.map((term) => `(?=.*${term})`).join("");
  product = await Product.findOne({
    normalizedTitle: { $regex: regexPattern, $options: "i" },
    hasPriceGuide: true,
  }).sort({ "priceGuideSummary.all.count": -1 }); // Prefer products with more data

  return product;
}

// API: Search for pedals and get prices
app.post("/api/search", async (req, res) => {
  try {
    const { pedals } = req.body;

    if (!pedals || !Array.isArray(pedals)) {
      return res.status(400).json({ error: "Pedals array is required" });
    }

    const results = [];

    for (const pedal of pedals) {
      const pedalName = typeof pedal === "string" ? pedal : pedal.name || "";
      const condition =
        typeof pedal === "object" ? pedal.condition : null;

      const product = await findMatchingProduct(pedalName, condition);

      if (product && product.priceGuideSummary?.all?.median) {
        const medianPrice = product.priceGuideSummary.all.median;
        const offer = calculateOffer(medianPrice);

        results.push({
          pedalName,
          condition: condition || "Unknown",
          matchedProduct: product.title,
          brand: product.brand,
          price: medianPrice,
          offer,
          hasPriceGuide: true,
          productId: product.canonicalProductId,
        });
      } else {
        results.push({
          pedalName,
          condition: condition || "Unknown",
          matchedProduct: null,
          brand: null,
          price: null,
          offer: 0,
          hasPriceGuide: false,
          productId: null,
        });
      }
    }

    // Sort by price (lowest to highest)
    results.sort((a, b) => {
      if (!a.price && !b.price) return 0;
      if (!a.price) return 1;
      if (!b.price) return -1;
      return a.price - b.price;
    });

    res.json({ results });
  } catch (error) {
    console.error("Error in /api/search:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// API: Process spreadsheet upload
app.post("/api/upload", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    const workbook = XLSX.read(req.file.buffer, { type: "buffer" });
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json(worksheet);

    // Expected format: Name, Pedal, Condition (or variations)
    const processedData = [];

    for (const row of data) {
      const name = row.Name || row.name || row["Person Name"] || "";
      const pedal = row.Pedal || row.pedal || row["Pedal Name"] || "";
      const condition =
        row.Condition ||
        row.condition ||
        row["Pedal Condition"] ||
        "Unknown";

      if (name && pedal) {
        processedData.push({ name, pedal, condition });
      }
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

        if (product && product.priceGuideSummary?.all?.median) {
          const medianPrice = product.priceGuideSummary.all.median;
          const offer = calculateOffer(medianPrice);

          pedalResults.push({
            pedal,
            condition,
            matchedProduct: product.title,
            brand: product.brand,
            price: medianPrice,
            offer,
            hasPriceGuide: true,
          });
        } else {
          pedalResults.push({
            pedal,
            condition,
            matchedProduct: null,
            brand: null,
            price: null,
            offer: 0,
            hasPriceGuide: false,
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

      // Calculate totals
      const totalPrice = pedalResults.reduce(
        (sum, p) => sum + (p.price || 0),
        0
      );
      const totalOffer = pedalResults.reduce(
        (sum, p) => sum + (p.offer || 0),
        0
      );

      allResults[personName] = {
        pedals: pedalResults,
        totalPrice,
        totalOffer,
      };
    }

    res.json({ results: allResults });
  } catch (error) {
    console.error("Error in /api/upload:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// API: Generate and download spreadsheet
app.post("/api/download", async (req, res) => {
  try {
    const { data } = req.body; // Format: { "Person Name": { pedals: [...], totalPrice, totalOffer } }

    if (!data || typeof data !== "object") {
      return res.status(400).json({ error: "Invalid data format" });
    }

    // Create workbook
    const workbook = XLSX.utils.book_new();

    for (const [personName, personData] of Object.entries(data)) {
      const rows = [
        ["Person", "Pedal", "Condition", "Brand", "Price", "Offer"],
      ];

      // Add pedal rows
      for (const pedal of personData.pedals || []) {
        rows.push([
          personName,
          pedal.matchedProduct || pedal.pedal || "",
          pedal.condition || "",
          pedal.brand || "",
          pedal.price || 0,
          pedal.offer || 0,
        ]);
      }

      // Add total row
      rows.push([
        personName,
        "TOTAL",
        "",
        "",
        personData.totalPrice || 0,
        "",
      ]);

      // Add offer row
      rows.push([
        personName,
        "OFFER",
        "",
        "",
        "",
        personData.totalOffer || 0,
      ]);

      // Add empty row for spacing
      rows.push([]);

      // Create worksheet
      const worksheet = XLSX.utils.aoa_to_sheet(rows);

      // Add worksheet to workbook (one sheet per person, or combine all)
      if (Object.keys(data).length === 1) {
        XLSX.utils.book_append_sheet(workbook, worksheet, "Results");
      } else {
        // Multiple people - create separate sheets or combine
        const sheetName = personName.substring(0, 31); // Excel sheet name limit
        XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
      }
    }

    // If multiple people, also create a combined sheet
    if (Object.keys(data).length > 1) {
      const combinedRows = [
        ["Person", "Pedal", "Condition", "Brand", "Price", "Offer"],
      ];

      for (const [personName, personData] of Object.entries(data)) {
        for (const pedal of personData.pedals || []) {
          combinedRows.push([
            personName,
            pedal.matchedProduct || pedal.pedal || "",
            pedal.condition || "",
            pedal.brand || "",
            pedal.price || 0,
            pedal.offer || 0,
          ]);
        }
        combinedRows.push([
          personName,
          "TOTAL",
          "",
          "",
          personData.totalPrice || 0,
          "",
        ]);
        combinedRows.push([
          personName,
          "OFFER",
          "",
          "",
          "",
          personData.totalOffer || 0,
        ]);
        combinedRows.push([]);
      }

      const combinedWorksheet = XLSX.utils.aoa_to_sheet(combinedRows);
      XLSX.utils.book_append_sheet(workbook, combinedWorksheet, "All Results");
    }

    // Generate buffer
    const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });

    // Send file
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="pedal_prices_${Date.now()}.xlsx"`
    );
    res.send(buffer);
  } catch (error) {
    console.error("Error in /api/download:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Serve frontend
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log(`📊 MongoDB: ${MONGO_URI}`);
});
