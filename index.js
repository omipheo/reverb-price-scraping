require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const path = require("path");
const session = require("express-session");
const MongoStore = require("connect-mongo");
const Product = require("./model/product.mdl");
const User = require("./model/user.mdl");
const Calculation = require("./model/calculation.mdl");
const UserPedal = require("./model/user-pedal.mdl");
const PriceAudit = require("./model/price-audit.mdl");
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

// Session configuration with MongoDB store
app.use(
  session({
    secret: process.env.SESSION_SECRET || "your-secret-key-change-this",
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({
      mongoUrl: MONGO_URI,
      touchAfter: 24 * 3600, // Lazy session update (24 hours)
    }),
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
// This should match the normalization used in scrape-monthly.js
function normalizePedalName(name) {
  return (name || "")
    .toLowerCase()
    .replace(/\b(excellent|very good|good|fair|poor|mint|b-stock|demo)\b/gi, " ")
    .replace(/\bcondition\b/gi, " ")
    .replace(/\b(19|20)\d{2}\b/g, " ") // Remove years (matches scraping script)
    .replace(/\([^)]*\)/g, " ") // Remove parentheses content
    .replace(/\[[^\]]*\]/g, " ") // Remove brackets content
    .replace(/[^a-z0-9]+/g, " ") // Replace all non-alphanumeric with space
    .replace(/\s+/g, " ") // Collapse multiple spaces
    .trim();
}

// Utility: Calculate offer based on price
function calculateOffer(price) {
  if (!price || price <= 0) return 0;
  if (price <= 69) return 20;
  if (price <= 199) return Math.round(price * 0.7);
  return Math.round(price * 0.75);
}

// Utility: Normalize condition string for matching
function normalizeCondition(condition) {
  if (!condition) return null;
  // Convert to title case (first letter uppercase, rest lowercase)
  return condition
    .toLowerCase()
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

// Utility: Calculate median (middle value) from an array of numbers
function median(nums) {
  if (!nums || nums.length === 0) return 0;
  const s = [...nums].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

// Utility: Calculate price from product transactions based on condition
function calculatePriceFromTransactions(product, condition = null) {
  if (!product || !product.priceGuide || product.priceGuide.length === 0) {
    return null;
  }

  // Sort transactions by createdAt (most recent first)
  const sortedTransactions = [...product.priceGuide].sort((a, b) => {
    return (b.createdAt || 0) - (a.createdAt || 0);
  });

  let relevantTransactions = [];

  if (condition && condition !== "Unknown") {
    // Normalize condition for matching
    const normalizedCondition = normalizeCondition(condition);
    
    // With condition: Get last 6 transactions in that specific condition
    // Match case-insensitively
    relevantTransactions = sortedTransactions
      .filter(t => {
        const txCondition = normalizeCondition(t.condition);
        return txCondition === normalizedCondition;
      })
      .slice(0, 6);
    console.log("relevantTransactions", relevantTransactions);
    // Take average of middle 2 (remove first 2 and last 2, keep middle 2)
    if (relevantTransactions.length >= 6) {
      relevantTransactions = relevantTransactions.slice(2, 4); // Middle 2 (indices 2 and 3)
    } else if (relevantTransactions.length >= 4) {
      // If we have 4-5 transactions, take middle 2
      const start = Math.floor((relevantTransactions.length - 2) / 2);
      relevantTransactions = relevantTransactions.slice(start, start + 2);
    }
    // If less than 4, use all available
  } else {
    // Without condition: Get last 14 non-mint transactions
    // We need to look through transactions until we find 14 non-mint ones
    for (const tx of sortedTransactions) {
      const txCondition = normalizeCondition(tx.condition);
      if (txCondition !== "Mint") {
        relevantTransactions.push(tx);
        if (relevantTransactions.length >= 14) {
          break;
        }
      }
    }
    // Take average of middle 6 (remove first 4 and last 4, keep middle 6)
    if (relevantTransactions.length >= 14) {
      relevantTransactions = relevantTransactions.slice(4, 10); // Middle 6 (indices 4-9)
    } else if (relevantTransactions.length >= 10) {
      // If we have 10-13 transactions, take middle 6
      const start = Math.floor((relevantTransactions.length - 6) / 2);
      relevantTransactions = relevantTransactions.slice(start, start + 6);
    } else if (relevantTransactions.length >= 6) {
      // If we have 6-9 transactions, take middle 2-4
      const start = Math.floor((relevantTransactions.length - 2) / 2);
      relevantTransactions = relevantTransactions.slice(start, start + 2);
    }
    // If less than 6, use all available
  }

  if (relevantTransactions.length === 0) {
    return null;
  }

  // Calculate average of the selected transactions
  const amounts = relevantTransactions
    .map(t => t.amount)
    .filter(Number.isFinite);

  if (amounts.length === 0) {
    return null;
  }
  console.log("amounts", amounts);
  const sum = amounts.reduce((a, b) => a + b, 0);
  const average = sum / amounts.length;
  
  // Apply discount based on price
  // For pedals over $200: lower by 5%
  // For pedals under $200: lower by 10%
  let adjustedPrice = average;
  if (average >= 200) {
    adjustedPrice = average * 0.95; // 5% discount
  } else {
    adjustedPrice = average * 0.90; // 10% discount
  }

  return Number(adjustedPrice.toFixed(2));
}

// Utility: Find best matching product in MongoDB
async function findMatchingProduct(pedalName, condition = null) {
  const normalized = normalizePedalName(pedalName);
  const searchTerms = normalized.split(" ").filter((t) => t.length > 1); // Changed from > 2 to > 1 to include "ts", "9", etc.

  // Try exact match first
  let product = await Product.findOne({
    normalizedTitle: normalized,
    hasPriceGuide: true,
  });

  if (product) return product;

  // Try fuzzy match using search terms (all terms must be present)
  if (searchTerms.length > 0) {
    const regexPattern = searchTerms.map((term) => `(?=.*${term})`).join("");
    product = await Product.findOne({
      normalizedTitle: { $regex: regexPattern, $options: "i" },
      hasPriceGuide: true,
    }).sort({ "priceGuideSummary.all.count": -1 }); // Prefer products with more data

    if (product) return product;
  }

  // Try partial match - at least 2 key terms must match (for cases like "ts-9" vs "ts9")
  if (searchTerms.length >= 2) {
    // Get the most important terms (brand name and model number)
    const importantTerms = searchTerms.filter(t => t.length >= 3); // Brand names and model numbers
    if (importantTerms.length >= 2) {
      const partialPattern = importantTerms.slice(0, 2).map((term) => `(?=.*${term})`).join("");
      product = await Product.findOne({
        normalizedTitle: { $regex: partialPattern, $options: "i" },
        hasPriceGuide: true,
      }).sort({ "priceGuideSummary.all.count": -1 });

      if (product) return product;
    }
  }

  // Last resort: try matching just the brand if available
  const brandTerm = searchTerms.find(t => t.length >= 4); // Likely brand name
  if (brandTerm) {
    product = await Product.findOne({
      $and: [
        { normalizedTitle: { $regex: brandTerm, $options: "i" } },
        { hasPriceGuide: true }
      ]
    }).sort({ "priceGuideSummary.all.count": -1 });
  }

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

// API: Delete all calculations for user
app.delete("/api/calculations", requireAuth, async (req, res) => {
  try {
    const result = await Calculation.deleteMany({ userId: req.session.userId });
    res.json({ 
      success: true, 
      deletedCount: result.deletedCount 
    });
  } catch (error) {
    console.error("Error in /api/calculations DELETE:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// API: Delete specific calculation
app.delete("/api/calculations/:id", requireAuth, async (req, res) => {
  try {
    const result = await Calculation.deleteOne({
      _id: req.params.id,
      userId: req.session.userId,
    });

    if (result.deletedCount === 0) {
      return res.status(404).json({ error: "Calculation not found" });
    }

    res.json({ success: true });
  } catch (error) {
    console.error("Error in /api/calculations/:id DELETE:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// API: Update match feedback (No Match? / Partial match?) for a pedal in a calculation
app.patch("/api/calculations/:id/pedal-feedback", requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { productId, noMatch, partialMatch } = req.body;
    const calculation = await Calculation.findOne({ _id: id, userId: req.session.userId });
    if (!calculation) {
      return res.status(404).json({ error: "Calculation not found" });
    }
    const results = calculation.results;
    if (!results || typeof results !== "object") {
      return res.status(400).json({ error: "No results in calculation" });
    }
    let updated = false;
    for (const personKey of Object.keys(results)) {
      const personData = results[personKey];
      if (!personData || !Array.isArray(personData.pedals)) continue;
      for (const p of personData.pedals) {
        if (p.productId === productId) {
          p.noMatch = !!noMatch;
          p.partialMatch = !!partialMatch;
          updated = true;
          break;
        }
      }
      if (updated) break;
    }
    if (!updated) {
      return res.status(404).json({ error: "Pedal not found in calculation" });
    }
    calculation.results = results;
    await calculation.save();
    res.json({ success: true });
  } catch (error) {
    console.error("Error in PATCH /api/calculations/:id/pedal-feedback:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Helper: add 1 year to a date
function addOneYear(date) {
  const d = new Date(date);
  d.setFullYear(d.getFullYear() + 1);
  return d;
}

// Helper: build Reverb Price Guide link (working format: query param)
function buildReverbPgLink(product) {
  if (!product || !product.slug) return null;
  const query = product.slug.replace(/-/g, "+");
  return `https://reverb.com/price-guide?query=${query}`;
}

// Helper: 2nd lowest price from price guide (historical/sold data). Client: "use the 2nd lowest historical price".
function get2ndLowestFromPriceGuide(product) {
  if (!product || !product.priceGuide || product.priceGuide.length < 2) return null;
  const amounts = product.priceGuide
    .map((t) => t.amount)
    .filter(Number.isFinite);
  if (amounts.length < 2) return null;
  const sorted = [...amounts].sort((a, b) => a - b);
  return sorted[1];
}

// Helper: round to nearest X9; if exactly in middle (e.g. 115.5) round up
function roundToEndIn9(value) {
  if (value == null || !Number.isFinite(value) || value < 0) return null;
  const lower9 = Math.floor((value + 1) / 10) * 10 - 1;
  const upper9 = lower9 + 10;
  const mid = (lower9 + upper9) / 2;
  return value >= mid ? upper9 : lower9;
}

// Calculate PTM Sell Price from product. Assume 6+ for sale; use transaction history high only (no Reverb suggested yet).
function calculatePtmSellPrice(product) {
  if (!product || !product.priceGuideSummary || !product.priceGuideSummary.all) return null;
  const high = product.priceGuideSummary.all.high;
  if (high == null || !Number.isFinite(high) || high <= 0) return null;
  const quantityForSale = 6; // Assume 6+ until we have real data
  const is6Plus = quantityForSale >= 6;
  const is91Plus = high >= 91;
  let pct;
  if (is6Plus && is91Plus) pct = 0.10;
  else if (is6Plus && !is91Plus) pct = 0.15;
  else if (!is6Plus && is91Plus) pct = 0.20;
  else pct = 0.25;
  const withPct = high * (1 + pct);
  return roundToEndIn9(withPct);
}

// API: Update PTM Buy Price for a product (by canonicalProductId)
app.patch("/api/products/:productId/ptm-buy-price", requireAuth, async (req, res) => {
  try {
    const { productId } = req.params;
    const { ptmBuyPrice } = req.body;
    if (productId === undefined || productId === "") {
      return res.status(400).json({ error: "Product ID is required" });
    }
    const product = await Product.findOne({ canonicalProductId: productId });
    if (!product) {
      return res.status(404).json({ error: "Product not found" });
    }
    const oldValue = product.ptmBuyPrice;
    const newValue = ptmBuyPrice != null ? Number(ptmBuyPrice) : null;
    const now = new Date();
    const expiresAt = newValue != null ? addOneYear(now) : null;
    product.ptmBuyPrice = newValue;
    product.ptmBuyPriceExpiresAt = expiresAt;
    await product.save();
    await PriceAudit.create({
      userId: req.session.userId,
      productId: product.canonicalProductId,
      field: "ptmBuyPrice",
      oldValue,
      newValue,
    });
    res.json({
      success: true,
      productId: product.canonicalProductId,
      ptmBuyPrice: product.ptmBuyPrice,
      ptmBuyPriceExpiresAt: product.ptmBuyPriceExpiresAt ? product.ptmBuyPriceExpiresAt.toISOString().slice(0, 10) : null,
    });
  } catch (error) {
    console.error("Error in PATCH /api/products/:productId/ptm-buy-price:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// API: Update PTM Sell Price for a product (by canonicalProductId). Only set expiration when user overrides.
app.patch("/api/products/:productId/ptm-sell-price", requireAuth, async (req, res) => {
  try {
    const { productId } = req.params;
    const { ptmSellPrice } = req.body;
    if (productId === undefined || productId === "") {
      return res.status(400).json({ error: "Product ID is required" });
    }
    const product = await Product.findOne({ canonicalProductId: productId });
    if (!product) {
      return res.status(404).json({ error: "Product not found" });
    }
    const newValue = ptmSellPrice != null ? Number(ptmSellPrice) : null;
    const now = new Date();
    product.ptmSellPrice = newValue;
    product.ptmSellPriceExpiresAt = newValue != null ? addOneYear(now) : null;
    await product.save();
    res.json({
      success: true,
      productId: product.canonicalProductId,
      ptmSellPrice: product.ptmSellPrice,
      ptmSellPriceExpiresAt: product.ptmSellPriceExpiresAt ? product.ptmSellPriceExpiresAt.toISOString().slice(0, 10) : null,
    });
  } catch (error) {
    console.error("Error in PATCH /api/products/:productId/ptm-sell-price:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// API: Add a new pedal (user-added; not from Reverb). Optional PTM Buy Price.
app.post("/api/pedals", requireAuth, async (req, res) => {
  try {
    const { title, ptmBuyPrice } = req.body;
    if (!title || typeof title !== "string" || !title.trim()) {
      return res.status(400).json({ error: "Pedal name (title) is required" });
    }
    const normalized = normalizePedalName(title.trim());
    const now = new Date();
    const expiresAt = ptmBuyPrice != null && Number(ptmBuyPrice) > 0 ? addOneYear(now) : null;
    const price = ptmBuyPrice != null ? Number(ptmBuyPrice) : null;
    const pedal = new UserPedal({
      title: title.trim(),
      normalizedTitle: normalized,
      ptmBuyPrice: price,
      ptmBuyPriceExpiresAt: expiresAt,
      userId: req.session.userId,
    });
    await pedal.save();
    res.status(201).json({
      success: true,
      pedal: {
        id: pedal._id,
        title: pedal.title,
        ptmBuyPrice: pedal.ptmBuyPrice,
        ptmBuyPriceExpiresAt: pedal.ptmBuyPriceExpiresAt,
      },
    });
  } catch (error) {
    console.error("Error in POST /api/pedals:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// API: Update PTM Buy Price for a user-added pedal (by _id)
app.patch("/api/pedals/:id/ptm-buy-price", requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { ptmBuyPrice } = req.body;
    const pedal = await UserPedal.findOne({ _id: id, userId: req.session.userId });
    if (!pedal) {
      return res.status(404).json({ error: "Pedal not found" });
    }
    const now = new Date();
    const expiresAt = ptmBuyPrice != null && Number(ptmBuyPrice) > 0 ? addOneYear(now) : null;
    pedal.ptmBuyPrice = ptmBuyPrice != null ? Number(ptmBuyPrice) : null;
    pedal.ptmBuyPriceExpiresAt = expiresAt;
    await pedal.save();
    res.json({
      success: true,
      pedal: {
        id: pedal._id,
        title: pedal.title,
        ptmBuyPrice: pedal.ptmBuyPrice,
        ptmBuyPriceExpiresAt: pedal.ptmBuyPriceExpiresAt,
      },
    });
  } catch (error) {
    console.error("Error in PATCH /api/pedals/:id/ptm-buy-price:", error);
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

      if (product) {
        const price = calculatePriceFromTransactions(product, condition);
        const reverbPgHistPrice = price;
        const reverbPgLink = buildReverbPgLink(product);
        const reverbMarketSoldPrice = get2ndLowestFromPriceGuide(product);
        const reverbMarketSoldLink = buildReverbMarketSoldLink(product);
        const ptmBuyPrice = product.ptmBuyPrice != null ? product.ptmBuyPrice : null;
        const ptmBuyPriceExpiresAt = product.ptmBuyPriceExpiresAt || null;
        const expStr = ptmBuyPriceExpiresAt ? (ptmBuyPriceExpiresAt.toISOString ? ptmBuyPriceExpiresAt.toISOString().slice(0, 10) : ptmBuyPriceExpiresAt) : null;
        const ptmSellPrice = product.ptmSellPrice != null ? product.ptmSellPrice : calculatePtmSellPrice(product);
        const ptmSellPriceExpiresAt = product.ptmSellPriceExpiresAt || null;
        const sellExpStr = ptmSellPriceExpiresAt ? (ptmSellPriceExpiresAt.toISOString ? ptmSellPriceExpiresAt.toISOString().slice(0, 10) : ptmSellPriceExpiresAt) : null;

        if (price !== null) {
          const offer = calculateOffer(price);

          results.push({
            pedalName,
            condition: condition || "Unknown",
            matchedProduct: product.title,
            brand: product.brand,
            price,
            offer,
            hasPriceGuide: true,
            productId: product.canonicalProductId,
            reverbPgHistPrice,
            reverbPgLink,
            reverbMarketSoldPrice,
            reverbMarketSoldLink,
            amtListedOnReverbMarket: null,
            ptmBuyPrice,
            ptmBuyPriceExpiresAt: expStr,
            ptmSellPrice,
            ptmSellPriceExpiresAt: sellExpStr,
            noMatch: false,
            partialMatch: false,
          });
        } else {
          results.push({
            pedalName,
            condition: condition || "Unknown",
            matchedProduct: product.title,
            brand: product.brand,
            price: null,
            offer: 0,
            hasPriceGuide: false,
            productId: product.canonicalProductId,
            reverbPgHistPrice: null,
            reverbPgLink,
            reverbMarketSoldPrice,
            reverbMarketSoldLink,
            amtListedOnReverbMarket: null,
            ptmBuyPrice,
            ptmBuyPriceExpiresAt: expStr,
            ptmSellPrice,
            ptmSellPriceExpiresAt: sellExpStr,
            noMatch: false,
            partialMatch: false,
          });
        }
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
          reverbPgHistPrice: null,
          reverbPgLink: null,
          reverbMarketSoldPrice: null,
          reverbMarketSoldLink: null,
          amtListedOnReverbMarket: null,
          ptmBuyPrice: null,
          ptmBuyPriceExpiresAt: null,
          ptmSellPrice: null,
          ptmSellPriceExpiresAt: null,
          noMatch: false,
          partialMatch: false,
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

    // FMV = sum of PTM Buy Prices only (client requirement)
    const totalPrice = results.reduce((sum, r) => sum + (r.ptmBuyPrice != null ? r.ptmBuyPrice : 0), 0);
    const totalOffer = calculateOffer(totalPrice);

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
          reverbPgHistPrice: r.reverbPgHistPrice,
          reverbPgLink: r.reverbPgLink,
          reverbMarketSoldPrice: r.reverbMarketSoldPrice,
          reverbMarketSoldLink: r.reverbMarketSoldLink,
          amtListedOnReverbMarket: r.amtListedOnReverbMarket,
          ptmBuyPrice: r.ptmBuyPrice,
          ptmBuyPriceExpiresAt: r.ptmBuyPriceExpiresAt,
          productId: r.productId,
          ptmSellPrice: r.ptmSellPrice,
          ptmSellPriceExpiresAt: r.ptmSellPriceExpiresAt,
          noMatch: r.noMatch || false,
          partialMatch: r.partialMatch || false,
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
          const reverbMarketSoldPrice = get2ndLowestFromPriceGuide(product);
          const reverbMarketSoldLink = buildReverbPgLink(product);
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
            noMatch: false,
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
});

// API: Generate and download spreadsheet
app.post("/api/download", requireAuth, async (req, res) => {
  try {
    const { data } = req.body; // Format: { "Person Name": { pedals: [...], totalPrice, totalOffer } }

    if (!data || typeof data !== "object") {
      return res.status(400).json({ error: "Invalid data format" });
    }

    // Get logged-in user's name
    const userName = req.session.userName || "User";

    // Check if data is empty
    const dataEntries = Object.entries(data);
    if (dataEntries.length === 0) {
      return res.status(400).json({ error: "No data to download" });
    }

    // Check if any person has pedals
    const hasAnyPedals = dataEntries.some(([_, personData]) => {
      return personData && Array.isArray(personData.pedals) && personData.pedals.length > 0;
    });

    if (!hasAnyPedals) {
      return res.status(400).json({ error: "No pedals found in data" });
    }

    // Create workbook
    const workbook = XLSX.utils.book_new();

    for (const [personName, personData] of dataEntries) {
      // Skip if personData is invalid or has no pedals
      if (!personData || !Array.isArray(personData.pedals) || personData.pedals.length === 0) {
        continue;
      }

      const rows = [
        ["Person", "Pedal", "Condition", "Brand", "FMV", "Offer"],
      ];

      // Add pedal rows - use logged-in user's name instead of personName
      for (const pedal of personData.pedals) {
        rows.push([
          userName,
          pedal.matchedProduct || pedal.pedal || "",
          pedal.condition || "",
          pedal.brand || "",
          pedal.price || 0,
          pedal.offer || 0,
        ]);
      }

      // Add total row
      rows.push([
        userName,
        "TOTAL",
        "",
        "",
        personData.totalPrice || 0,
        "",
      ]);

      // Add offer row
      rows.push([
        userName,
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
      if (dataEntries.length === 1) {
        XLSX.utils.book_append_sheet(workbook, worksheet, "Results");
      } else {
        // Multiple people - use user's name for sheet name
        const sheetName = userName.substring(0, 31); // Excel sheet name limit
        XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
      }
    }

    // If multiple people, also create a combined sheet
    if (dataEntries.length > 1) {
      const combinedRows = [
        ["Person", "Pedal", "Condition", "Brand", "Price", "Offer"],
      ];

      for (const [personName, personData] of dataEntries) {
        // Skip if personData is invalid or has no pedals
        if (!personData || !Array.isArray(personData.pedals) || personData.pedals.length === 0) {
          continue;
        }

        for (const pedal of personData.pedals) {
          combinedRows.push([
            userName,
            pedal.matchedProduct || pedal.pedal || "",
            pedal.condition || "",
            pedal.brand || "",
            pedal.price || 0,
            pedal.offer || 0,
          ]);
        }
        combinedRows.push([
          userName,
          "TOTAL",
          "",
          "",
          personData.totalPrice || 0,
          "",
        ]);
        combinedRows.push([
          userName,
          "OFFER",
          "",
          "",
          "",
          personData.totalOffer || 0,
        ]);
        combinedRows.push([]);
      }

      // Only create combined sheet if there are rows (more than just header)
      if (combinedRows.length > 1) {
        const combinedWorksheet = XLSX.utils.aoa_to_sheet(combinedRows);
        XLSX.utils.book_append_sheet(workbook, combinedWorksheet, "All Results");
      }
    }

    // Check if workbook has any sheets before writing
    if (!workbook.SheetNames || workbook.SheetNames.length === 0) {
      return res.status(400).json({ error: "Cannot create spreadsheet: no valid data found" });
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

// Handle favicon requests (prevent 404 errors)
app.get("/favicon.ico", (req, res) => {
  res.status(204).end();
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
