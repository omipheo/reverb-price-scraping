/**
 * Usage report for stompboxpricing.com (Reverb pricing tool).
 *
 * Reports how much the tool has been used, based on the real record in the
 * database (the `calculations` collection) rather than GHL.
 *
 * Run against LOCAL db:
 *   node scripts/usage-report.js
 *
 * Run against PRODUCTION (pass the prod connection string):
 *   MONGO_URI="mongodb+srv://user:pass@host/dbname" node scripts/usage-report.js
 *   # or
 *   node scripts/usage-report.js "mongodb+srv://user:pass@host/dbname"
 *
 * Optional: limit the "recent days" window (default 30):
 *   node scripts/usage-report.js --days=60
 */

require("dotenv").config();
const mongoose = require("mongoose");
const Calculation = require("../model/calculation.mdl");
const User = require("../model/user.mdl");

function arg(name, fallback) {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split("=")[1] : fallback;
}

const cliUri = process.argv.slice(2).find((a) => a.startsWith("mongodb"));
const MONGO_URI =
  cliUri || process.env.MONGO_URI || "mongodb://127.0.0.1:27017/pedal_prices_v2";
const RECENT_DAYS = parseInt(arg("days", "30"), 10);

function fmt(d) {
  return d ? new Date(d).toISOString().slice(0, 16).replace("T", " ") + " UTC" : "—";
}
function daysAgo(n) {
  return new Date(Date.now() - n * 24 * 60 * 60 * 1000);
}

(async () => {
  const safeUri = MONGO_URI.replace(/(:\/\/[^:]+:)[^@]+@/, "$1****@");
  console.log(`\nConnecting to: ${safeUri}\n`);
  await mongoose.connect(MONGO_URI);

  const total = await Calculation.countDocuments();

  if (total === 0) {
    console.log("No calculations found in this database.");
    console.log("If you expected usage, you're likely pointed at the wrong DB");
    console.log("(this looks like a fresh/empty or local database).\n");
    await mongoose.disconnect();
    return;
  }

  const first = await Calculation.findOne().sort({ createdAt: 1 }).select("createdAt");
  const last = await Calculation.findOne().sort({ createdAt: -1 }).select("createdAt");
  const recentCount = await Calculation.countDocuments({ createdAt: { $gte: daysAgo(RECENT_DAYS) } });
  const last7 = await Calculation.countDocuments({ createdAt: { $gte: daysAgo(7) } });

  console.log("================ STOMPBOXPRICING.COM USAGE ================\n");
  console.log(`Total calculations ever run : ${total}`);
  console.log(`First calculation           : ${fmt(first?.createdAt)}`);
  console.log(`Most recent calculation     : ${fmt(last?.createdAt)}`);
  console.log(`Last 7 days                 : ${last7}`);
  console.log(`Last ${RECENT_DAYS} days${" ".repeat(Math.max(0, 16 - String(RECENT_DAYS).length))}: ${recentCount}\n`);

  // Per-day breakdown (last RECENT_DAYS)
  const perDay = await Calculation.aggregate([
    { $match: { createdAt: { $gte: daysAgo(RECENT_DAYS) } } },
    {
      $group: {
        _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
        count: { $sum: 1 },
      },
    },
    { $sort: { _id: 1 } },
  ]);

  console.log(`---- Per-day (last ${RECENT_DAYS} days) ----`);
  if (perDay.length === 0) {
    console.log("(no activity in this window)\n");
  } else {
    perDay.forEach((d) => console.log(`${d._id}  ${"█".repeat(Math.min(d.count, 50))} ${d.count}`));
    console.log("");
  }

  // Per-user breakdown (all time)
  const perUser = await Calculation.aggregate([
    { $group: { _id: "$userId", count: { $sum: 1 }, last: { $max: "$createdAt" } } },
    { $sort: { count: -1 } },
  ]);

  const users = await User.find().select("name email role");
  const userMap = Object.fromEntries(users.map((u) => [String(u._id), u]));

  console.log("---- Per-user (all time) ----");
  perUser.forEach((u) => {
    const info = userMap[String(u._id)];
    const who = info ? `${info.name} <${info.email}> (${info.role})` : `unknown user ${u._id}`;
    console.log(`${String(u.count).padStart(5)}  last:${fmt(u.last)}  ${who}`);
  });
  console.log("\n==========================================================\n");

  await mongoose.disconnect();
})().catch((e) => {
  console.error("Report failed:", e.message);
  process.exit(1);
});
