const express = require("express");
const router = express.Router();
const requireAuth = require("../middleware/auth");
const upload = require("../middleware/upload");

// Auth routes
const authController = require("../controllers/authController");
router.post("/api/register", authController.register);
router.post("/api/login", authController.login);
router.post("/api/logout", authController.logout);
router.get("/api/user", authController.getCurrentUser);

// Calculation routes
const calculationController = require("../controllers/calculationController");
router.get("/api/calculations", requireAuth, calculationController.getCalculations);
router.get("/api/calculations/:id", requireAuth, calculationController.getCalculation);
router.delete("/api/calculations", requireAuth, calculationController.deleteAllCalculations);
router.delete("/api/calculations/:id", requireAuth, calculationController.deleteCalculation);
router.patch("/api/calculations/:id/pedal-feedback", requireAuth, calculationController.updatePedalFeedback);

// Product routes
const productController = require("../controllers/productController");
router.patch("/api/products/:productId/ptm-buy-price", requireAuth, productController.updatePtmBuyPrice);
router.patch("/api/products/:productId/ptm-sell-price", requireAuth, productController.updatePtmSellPrice);

// User Pedal routes
const pedalController = require("../controllers/pedalController");
router.post("/api/pedals", requireAuth, pedalController.createPedal);
router.patch("/api/pedals/:id/ptm-buy-price", requireAuth, pedalController.updatePtmBuyPrice);

// Search route
const searchController = require("../controllers/searchController");
router.post("/api/search", requireAuth, searchController.searchPedals);

// Upload route
const uploadController = require("../controllers/uploadController");
router.post("/api/upload", requireAuth, upload.single("file"), uploadController.uploadFile);

// Download route
const downloadController = require("../controllers/downloadController");
router.post("/api/download", requireAuth, downloadController.downloadExcel);

module.exports = router;
