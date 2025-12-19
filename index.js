require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const path = require("path");
const session = require("express-session");
const Product = require("./model/product.mdl");
const User = require("./model/user.mdl");
const Calculation = require("./model/calculation.mdl");
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

// Session configuration
app.use(
  session({
    secret: process.env.SESSION_SECRET || "your-secret-key-change-this",
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: false, // Set to true if using HTTPS
      maxAge: 24 * 60 * 60 * 1000, // 24 hours
    },
  })
);

// Authentication middleware
const requireAuth = (req, res, next) => {
  if (!req.session.userId) {
    return res.status(401).json({ error: "Authentication required" });
  }
  next();
};

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

// API: Register new user
app.post("/api/register", async (req, res) => {
  try {
    const { email, password, name } = req.body;

    if (!email || !password || !name) {
      return res.status(400).json({ error: "Email, password, and name are required" });
    }

    // Check if user already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ error: "User already exists" });
    }

    // Create new user
    const user = new User({ email, password, name });
    await user.save();

    // Set session
    req.session.userId = user._id;
    req.session.userEmail = user.email;
    req.session.userName = user.name;

    res.json({
      success: true,
      user: {
        id: user._id,
        email: user.email,
        name: user.name,
      },
    });
  } catch (error) {
    console.error("Error in /api/register:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// API: Login
app.post("/api/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: "Email and password are required" });
    }

    // Find user
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    // Check password
    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    // Set session
    req.session.userId = user._id;
    req.session.userEmail = user.email;
    req.session.userName = user.name;

    res.json({
      success: true,
      user: {
        id: user._id,
        email: user.email,
        name: user.name,
      },
    });
  } catch (error) {
    console.error("Error in /api/login:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// API: Logout
app.post("/api/logout", (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      return res.status(500).json({ error: "Error logging out" });
    }
    res.json({ success: true });
  });
});

// API: Get current user
app.get("/api/user", (req, res) => {
  if (!req.session.userId) {
    return res.status(401).json({ error: "Not authenticated" });
  }
  res.json({
    id: req.session.userId,
    email: req.session.userEmail,
    name: req.session.userName,
  });
});

// API: Get calculation history
app.get("/api/calculations", requireAuth, async (req, res) => {
  try {
    const calculations = await Calculation.find({ userId: req.session.userId })
      .sort({ createdAt: -1 })
      .limit(50)
      .select("title inputType totalPrice totalOffer createdAt _id");

    res.json({ calculations });
  } catch (error) {
    console.error("Error in /api/calculations:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// API: Get specific calculation
app.get("/api/calculations/:id", requireAuth, async (req, res) => {
  try {
    const calculation = await Calculation.findOne({
      _id: req.params.id,
      userId: req.session.userId,
    });

    if (!calculation) {
      return res.status(404).json({ error: "Calculation not found" });
    }

    res.json({ calculation });
  } catch (error) {
    console.error("Error in /api/calculations/:id:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// API: Search for pedals and get prices
app.post("/api/search", requireAuth, async (req, res) => {
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

    // Calculate totals
    const totalPrice = results.reduce((sum, r) => sum + (r.price || 0), 0);
    const totalOffer = results.reduce((sum, r) => sum + (r.offer || 0), 0);

    // Format results for display (convert array to object format)
    const formattedResults = {
      "All Pedals": {
        pedals: results.map(r => ({
          pedal: r.pedalName,
          condition: r.condition,
          matchedProduct: r.matchedProduct,
          brand: r.brand,
          price: r.price,
          offer: r.offer,
          hasPriceGuide: r.hasPriceGuide,
        })),
        totalPrice,
        totalOffer,
      }
    };

    // Save calculation to database (save in the format that displayResults expects)
    const calculation = new Calculation({
      userId: req.session.userId,
      title: req.body.title || `Calculation ${new Date().toLocaleString()}`,
      inputType: "text",
      inputData: { pedals },
      results: formattedResults, // Save in object format
      totalPrice,
      totalOffer,
    });
    await calculation.save();

    res.json({ 
      results: formattedResults, // Return in object format
      calculationId: calculation._id,
      totalPrice,
      totalOffer,
    });
  } catch (error) {
    console.error("Error in /api/search:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// API: Process spreadsheet upload
app.post("/api/upload", requireAuth, upload.single("file"), async (req, res) => {
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
});

// API: Generate and download spreadsheet
app.post("/api/download", requireAuth, async (req, res) => {
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
