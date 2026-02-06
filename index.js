require("dotenv").config();
const express = require("express");
const path = require("path");
const connectDB = require("./config/database");
const configureSession = require("./config/session");
const routes = require("./routes");

const app = express();
const PORT = process.env.PORT || 3000;
const MONGO_URI = process.env.MONGO_URI || "mongodb://127.0.0.1:27017/pedal_prices_v2";

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public")));

// Session configuration
app.use(configureSession(MONGO_URI, process.env.SESSION_SECRET));

// Routes
app.use("/", routes);

// Handle favicon requests (prevent 404 errors)
app.get("/favicon.ico", (req, res) => {
  res.status(204).end();
});

// Serve frontend
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// Connect to MongoDB
connectDB(MONGO_URI);

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log(`📊 MongoDB: ${MONGO_URI}`);
});
