/**
 * Scrape Reverb marketplace SOLD listings per product, compute 2nd-lowest price,
 * and save reverbMarketSoldPrice + reverbMarketSoldLink on each product.
 *
 * Reverb API: same GraphQL endpoint and headers as scripts/scrape-monthly.js
 * (GQL_URL, REVERB_GQL_HEADERS from utils/reverb.js). This script uses a different
 * operation: Core_Marketplace_CombinedMarketplaceSearch / listingsSearch for sold
 * listings; scrape-monthly uses Core_SellFlow_Search (cspSearch) and
 * Search_PriceGuideTool_TransactionTable (priceRecordsSearch).
 *
 * Usage: node scripts/scrape-marketplace-sold.js [--dry-run] [--limit=N]
 *
 * Requires: MONGO_URI in .env. Run scripts/capture-marketplace-graphql.js first
 * to populate scripts/marketplace-sold-payload.json from the live site.
 */

require("dotenv").config();
const fs = require("fs");
const path = require("path");
const mongoose = require("mongoose");
const axios = require("axios");
const Product = require("../model/product.mdl");
const { GQL_URL, REVERB_GQL_HEADERS } = require("../utils/reverb");

const MONGO_URI = process.env.MONGO_URI;
const HEADERS = REVERB_GQL_HEADERS;

const PAYLOAD_PATH = path.join(__dirname, "marketplace-sold-payload.json");
const CATEGORY_SLUG = "effects-and-pedals";
const PAGE_SIZE = 45;
const DELAY_MS = 400;

function slugifyBrand(brand) {
  if (!brand || typeof brand !== "string") return "";
  return brand
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "");
}

function buildMarketSoldLink(queryParam, brandSlug) {
  const s = (queryParam || "").replace(/-/g, " ").trim();
  const q = encodeURIComponent(s).replace(/%20/g, "+");
  const make = encodeURIComponent(brandSlug || "");
  return `https://reverb.com/marketplace?query=${q}&make=${make}&product_type=${CATEGORY_SLUG}&show_only_sold=true`;
}

function get2ndLowest(amounts) {
  const valid = amounts.filter((n) => Number.isFinite(n) && n > 0);
  if (valid.length < 2) return null;
  const sorted = [...valid].sort((a, b) => a - b);
  return sorted[1];
}

async function fetchMarketplaceSoldPrices(query, brandSlug, payloadTemplate, debug = false) {
  const allAmounts = [];
  let offset = 0;
  const sample = payloadTemplate.sampleVariables || {};
  // Use the same variable shape as the captured request (e.g. inputListings)
  const inputKey = Object.keys(sample).find(
    (k) =>
      sample[k] &&
      typeof sample[k] === "object" &&
      (sample[k].showOnlySold === true || sample[k].limit != null)
  ) || "inputListings";
  const baseInput = { ...(sample[inputKey] || {}) };

  while (true) {
    const variables = { ...sample };
    variables[inputKey] = {
      ...baseInput,
      query: (query || "").trim() || undefined,
      categorySlugs: baseInput.categorySlugs || [CATEGORY_SLUG],
      brandSlugs: brandSlug ? [brandSlug] : (baseInput.brandSlugs || undefined),
      showOnlySold: true,
      limit: baseInput.limit ?? PAGE_SIZE,
      offset,
    };

    const payload = {
      operationName: payloadTemplate.operationName,
      query: payloadTemplate.query,
      variables,
    };

    try {
      const resp = await axios.post(GQL_URL, payload, { headers: HEADERS });

      if (resp.data?.errors) {
        console.warn(
          "   GraphQL errors:",
          JSON.stringify(resp.data.errors).slice(0, 300)
        );
        break;
      }

      const data = resp.data?.data?.listingsSearch;
      if (debug && offset === 0) {
        console.log("\n   [debug] response data keys:", resp.data?.data ? Object.keys(resp.data.data) : "none");
        console.log("   [debug] listingsSearch keys:", data ? Object.keys(data) : "none");
        console.log("   [debug] variables sent:", JSON.stringify(variables[inputKey]));
      }
      if (!data) break;

      const listings = data.listings || [];
      const total = data.total || 0;
      if (debug && offset === 0) {
        console.log("   [debug] total:", total, "listings this page:", listings.length);
        if (listings[0]) {
          console.log("   [debug] first listing keys:", Object.keys(listings[0]));
          console.log("   [debug] first listing pricing:", JSON.stringify(listings[0]?.pricing));
        }
      }
      const pageLimit = variables[inputKey].limit || PAGE_SIZE;

      for (const listing of listings) {
        const price = listing?.pricing?.buyerPrice;
        if (!price) continue;
        let amount = price.amount;
        if (amount == null && price.amountCents != null) {
          amount = price.amountCents / 100;
        }
        if (typeof amount === "string") amount = parseFloat(amount, 10);
        if (Number.isFinite(amount)) allAmounts.push(amount);
      }

      if (listings.length < pageLimit || allAmounts.length >= total) break;
      offset += pageLimit;
      await new Promise((r) => setTimeout(r, 150));
    } catch (err) {
      console.warn("   Request error:", err.response?.data || err.message);
      break;
    }
  }

  return allAmounts;
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const debug = args.includes("--debug");
  const limitArg = args.find((a) => a.startsWith("--limit="));
  const limit = limitArg ? parseInt(limitArg.split("=")[1], 10) : null;

  if (!MONGO_URI) {
    console.error("Set MONGO_URI in .env");
    process.exit(1);
  }

  let payloadTemplate;
  try {
    const raw = fs.readFileSync(PAYLOAD_PATH, "utf8");
    const parsed = JSON.parse(raw.replace(/\/\*[\s\S]*?\*\/|\/\/.*/g, "").trim());
    payloadTemplate = {
      operationName: parsed.operationName,
      query: parsed.query,
      sampleVariables: parsed.sampleVariables || {},
    };
    if (!payloadTemplate.operationName || !payloadTemplate.query) {
      throw new Error("operationName and query required in payload file. Run: node scripts/capture-marketplace-graphql.js");
    }
  } catch (e) {
    console.error("Failed to load marketplace payload:", e.message);
    console.error("Run first: node scripts/capture-marketplace-graphql.js");
    process.exit(1);
  }

  await mongoose.connect(MONGO_URI);
  console.log("Connected to MongoDB\n");

  const filter = { hasPriceGuide: true };
  let products = await Product.find(filter).lean();
  if (limit) products = products.slice(0, limit);
  console.log(`Products to process: ${products.length} (dryRun=${dryRun})\n`);

  let updated = 0;
  let failed = 0;

  for (let i = 0; i < products.length; i++) {
    const p = products[i];
    const brandSlug = slugifyBrand(p.brand);
    const searchQuery = (p.slug || p.title || "").trim().replace(/\s+/g, " ");
    const label = p.title || p.slug || p.canonicalProductId || "?";

    process.stdout.write(`[${i + 1}/${products.length}] ${label.slice(0, 50)}... `);

    const amounts = await fetchMarketplaceSoldPrices(
      searchQuery,
      brandSlug,
      payloadTemplate,
      debug && i === 0
    );
    const secondLowest = get2ndLowest(amounts);
    const link = buildMarketSoldLink(searchQuery.replace(/\s+/g, "-"), brandSlug);

    if (secondLowest == null) {
      console.log("no 2nd lowest");
      failed++;
    } else {
      console.log(`2nd lowest = $${secondLowest.toFixed(2)}`);
      if (!dryRun) {
        await Product.updateOne(
          { _id: p._id },
          {
            $set: {
              reverbMarketSoldPrice: secondLowest,
              reverbMarketSoldLink: link,
              reverbMarketSoldLastUpdated: new Date(),
            },
          }
        );
        updated++;
      }
    }

    if (i < products.length - 1) {
      await new Promise((r) => setTimeout(r, DELAY_MS));
    }
  }

  console.log("\nDone.");
  if (!dryRun) console.log(`Updated: ${updated}. No 2nd lowest: ${failed}.`);
  await mongoose.disconnect();
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
