#!/usr/bin/env node
/**
 * Set a user's role to admin by email. Run from project root:
 *   node scripts/set-admin.js <email>
 * Example: node scripts/set-admin.js dovid@example.com
 */
require("dotenv").config();
const mongoose = require("mongoose");
const User = require("../model/user.mdl");

const MONGO_URI = process.env.MONGO_URI || "mongodb://127.0.0.1:27017/pedal_prices_v2";

async function main() {
  const email = process.argv[2];
  if (!email) {
    console.error("Usage: node scripts/set-admin.js <email>");
    process.exit(1);
  }
  await mongoose.connect(MONGO_URI);
  const user = await User.findOneAndUpdate(
    { email: email.toLowerCase().trim() },
    { role: "admin" },
    { new: true }
  );
  if (!user) {
    console.error("User not found:", email);
    process.exit(1);
  }
  console.log("Set role to admin for:", user.email);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
