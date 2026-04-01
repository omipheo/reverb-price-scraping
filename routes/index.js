const express = require("express");
const router = express.Router();
const requireAuth = require("../middleware/auth");
const { requireAdmin } = require("../middleware/auth");
const upload = require("../middleware/upload");
const { log } = require("../middleware/requestLog");
const { requireSettingsUnlocked } = require("../middleware/settingsAuth");
const adminSettingsController = require("../controllers/adminSettingsController");
const buyPriceRuleController = require("../controllers/buyPriceRuleController");

// Auth routes (only admin can register new users)
const authController = require("../controllers/authController");
router.post("/api/register", requireAuth, authController.register);
router.post("/api/login", authController.login);
router.post("/api/logout", authController.logout);
router.get("/api/user", authController.getCurrentUser);
router.post("/api/log-client-error", requireAuth, (req, res) => {
  try {
    log("CLIENT: " + (req.body && req.body.message ? req.body.message : JSON.stringify(req.body || {})), "error");
  } catch (e) {}
  res.status(200).json({ ok: true });
});

// Calculation routes
const calculationController = require("../controllers/calculationController");
router.get("/api/calculations", requireAuth, calculationController.getCalculations);
router.get("/api/calculations/:id", requireAuth, calculationController.getCalculation);
router.delete("/api/calculations", requireAuth, calculationController.deleteAllCalculations);
router.delete("/api/calculations/:id", requireAuth, calculationController.deleteCalculation);
router.patch("/api/calculations/:id/pedal-feedback", requireAuth, calculationController.updatePedalFeedback);
router.post("/api/calculations/:id/ensure-no-match-product", requireAuth, calculationController.ensureNoMatchProduct);
router.get("/api/buy-price-rules", requireAuth, buyPriceRuleController.getBuyPriceRules);

// Admin Settings routes (per-admin settings password)
router.post(
  "/api/admin/settings/unlock",
  requireAuth,
  requireAdmin,
  adminSettingsController.unlockSettings
);
router.post(
  "/api/admin/settings/password",
  requireAuth,
  requireAdmin,
  requireSettingsUnlocked,
  adminSettingsController.changeSettingsPassword
);
router.get(
  "/api/admin/users",
  requireAuth,
  requireAdmin,
  requireSettingsUnlocked,
  adminSettingsController.listUsers
);
router.post(
  "/api/admin/users",
  requireAuth,
  requireAdmin,
  requireSettingsUnlocked,
  adminSettingsController.createUser
);
router.patch(
  "/api/admin/users/:id",
  requireAuth,
  requireAdmin,
  requireSettingsUnlocked,
  adminSettingsController.updateUser
);
router.delete(
  "/api/admin/users/:id",
  requireAuth,
  requireAdmin,
  requireSettingsUnlocked,
  adminSettingsController.deleteUser
);
router.patch(
  "/api/admin/buy-price-rules",
  requireAuth,
  requireAdmin,
  requireSettingsUnlocked,
  buyPriceRuleController.updateBuyPriceRules
);

// Product routes (pricing save is admin-only; checkboxes allowed for all)
const productController = require("../controllers/productController");
router.patch("/api/products/:productId/ptm-buy-price", requireAuth, requireAdmin, productController.updatePtmBuyPrice);
router.patch("/api/products/:productId/ptm-sell-price", requireAuth, requireAdmin, productController.updatePtmSellPrice);
router.patch("/api/products/:productId/buy-price", requireAuth, requireAdmin, productController.updateBuyPrice);

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
