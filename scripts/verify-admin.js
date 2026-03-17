#!/usr/bin/env node
/**
 * Verify a user's role in the database. Run from project root:
 *   node scripts/verify-admin.js <email>
 */
require("dotenv").config();
const mongoose = require("mongoose");
const User = require("../model/user.mdl");

const MONGO_URI = process.env.MONGO_URI || "mongodb://127.0.0.1:27017/pedal_prices_v2";

async function main() {
  const email = process.argv[2];
  if (!email) {
    console.error("Usage: node scripts/verify-admin.js <email>");
    process.exit(1);
  }
  await mongoose.connect(MONGO_URI);
  const user = await User.findOne({ email: email.toLowerCase().trim() }).select("email name role");
  if (!user) {
    console.error("User not found:", email);
    process.exit(1);
  }
  console.log("Email:", user.email);
  console.log("Name:", user.name);
  console.log("Role:", user.role || "(not set, treated as user)");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
