require("dotenv").config();
const mongoose = require("mongoose");
const axios = require("axios");
const Product = require("../model/product.mdl");

const GQL_URL = "https://gql.reverb.com/graphql";
const MONGO_URI = process.env.MONGO_URI;

const HEADERS = {
  "Content-Type": "application/json",
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  Accept: "application/json",
  Origin: "https://reverb.com",
  Referer: "https://reverb.com/",
};

function normalizeTitle(s) {
  return (s || "")
    .toLowerCase()
    .replace(/\b(excellent|very good|good|fair|poor|mint|b-stock|demo)\b/g, " ")
    .replace(/\bcondition\b/g, " ")
    .replace(/\b(19|20)\d{2}\b/g, " ")
    .replace(/\([^)]*\)/g, " ")
    .replace(/\[[^\]]*\]/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function median(nums) {
  if (!nums.length) return 0;
  const s = [...nums].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

function summarize(records, currency = "USD") {
  const amounts = records.map((r) => r.amount).filter(Number.isFinite);
  if (!amounts.length) {
    return { currency, count: 0, median: 0, average: 0, low: 0, high: 0, lastSoldAt: 0 };
  }
  const avg = amounts.reduce((a, b) => a + b, 0) / amounts.length;
  const last = records.reduce((mx, r) => Math.max(mx, r.createdAt || 0), 0);
  return {
    currency,
    count: amounts.length,
    median: Number(median(amounts).toFixed(2)),
    average: Number(avg.toFixed(2)),
    low: Number(Math.min(...amounts).toFixed(2)),
    high: Number(Math.max(...amounts).toFixed(2)),
    lastSoldAt: last,
  };
}

async function findBestCsp(query) {
  const q = query;

    const payload = {
    operationName: "Core_SellFlow_Search",
    variables: {
      offset: 0,
      sellCardLimit: 100, // Get more results to find the best match (including variants)
      q,
      excludedCategoryUuids: [
        "7681b711-435c-4923-bdc3-65076d15d78c",
        "98a45e2d-2cc2-4b17-b695-a5d198c8f6d3",
        "4ca6d5e9-f00f-468d-bcae-8c7497537281",
        "22af0079-d5e7-48d1-9e5c-108105a2156c",
      ],
      fullTextQueryOperand: "AND",
      sort: "RECENT_ORDERS_COUNT_USED_DESC",
      fuzzy: true,
      listingsThatShipTo: "XX",
      hasExpressSaleBid: false,
      includePriceRecommendations: true,
      priceRecommendationCountryCode: null,
    },
    query: `query Core_SellFlow_Search($q: String, $decades: [String], $finishes: [String], $brandNames: [String], $category_uuids: [String], $sellCardLimit: Int, $excludedCategoryUuids: [String], $boostByClicks: Boolean, $fullTextQueryOperand: reverb_search_FullTextQueryOperand, $sort: reverb_search_CSPSearchRequest_Sort, $fuzzy: Boolean, $offset: Int, $listingsThatShipTo: String, $hasExpressSaleBid: Boolean!, $includePriceRecommendations: Boolean!, $priceRecommendationCountryCode: String) {
      cspSearch(
        input: {fullTextQuery: $q, decades: $decades, finishes: $finishes, brandNames: $brandNames, categoryUuids: $category_uuids, withAggregations: [CATEGORY_UUIDS, FINISHES, DECADES, BRAND_NAMES], excludedCategoryUuids: $excludedCategoryUuids, limit: $sellCardLimit, offset: $offset, boostByClicks: $boostByClicks, fullTextQueryOperand: $fullTextQueryOperand, sort: $sort, fuzzy: $fuzzy, listingsThatShipTo: $listingsThatShipTo, hasExpressSaleBid: $hasExpressSaleBid}
      ) {
        filters {
          ...FlatFilter
          __typename
        }
        csps {
          _id
          ...SellCardData
          ...CSPPriceRecommendationData @include(if: $includePriceRecommendations)
          __typename
        }
        total
        offset
        limit
        __typename
      }
    }
    
    fragment FlatFilter on reverb_search_Filter {
      name
      key
      aggregationName
      widgetType
      options {
        count {
          value
          __typename
        }
        name
        selected
        paramName
        setValues
        unsetValues
        all
        optionValue
        __typename
      }
      __typename
    }
    
    fragment SellCardData on CSP {
      _id
      id
      title
      finishes
      image(input: {transform: "card_square"}) {
        _id
        source
        __typename
      }
      slug
      brand {
        _id
        name
        __typename
      }
      canonicalProductIds
      isTradeInEligible
      __typename
    }
    
    fragment CSPPriceRecommendationData on CSP {
      _id
      priceRecommendations(
        input: {conditionUuids: ["f7a3f48c-972a-44c6-b01a-0cd27488d3f6", "ac5b9c1e-dc78-466d-b0b3-7cf712967a48"], countryCode: $priceRecommendationCountryCode}
      ) {
        conditionUuid
        priceLow {
          amountCents
          amount
          currency
          __typename
        }
        priceHigh {
          amountCents
          amount
          currency
          __typename
        }
        __typename
      }
      __typename
    }`,
  };

  try {
    const resp = await axios.post(GQL_URL, payload, { headers: HEADERS });
    
    if (resp.data?.errors) {
      console.error(`GraphQL errors in findBestCsp:`, resp.data.errors);
      return null;
    }
    
    const csps = resp.data?.data?.cspSearch?.csps || [];
    
    // Filter to only products with canonicalProductIds
    const validCsps = csps.filter(c => Array.isArray(c.canonicalProductIds) && c.canonicalProductIds.length);
    
    if (validCsps.length === 0) return null;
    
    // Score all matches
    const queryLower = q.toLowerCase();
    const scored = validCsps.map(csp => {
      const title = (csp.title || "").toLowerCase();
      let score = 0;
      
      // Check if query terms appear in title
      const queryTerms = queryLower.split(/\s+/).filter(t => t.length > 2);
      for (const term of queryTerms) {
        if (title.includes(term)) {
          score += 10;
        }
      }
      
      // Bonus for exact year match if query contains a year
      const yearMatch = queryLower.match(/\b(19|20)\d{2}\b/);
      if (yearMatch) {
        // Check if year is in title or in the date range
        if (title.includes(yearMatch[0])) {
          score += 50; // Exact year match
        } else {
          // Check if year is within a date range (e.g., "1981 - 1985" contains 1982)
          const rangeMatch = title.match(/(\d{4})\s*-\s*(\d{4})/);
          if (rangeMatch) {
            const startYear = parseInt(rangeMatch[1]);
            const endYear = parseInt(rangeMatch[2]);
            const queryYear = parseInt(yearMatch[0]);
            if (queryYear >= startYear && queryYear <= endYear) {
              score += 30; // Year within range
            }
          }
        }
      }
      
      // Bonus for variant matches (Black Label, Silver Label, etc.)
      if (title.toLowerCase().includes("black label") && queryLower.includes("1982")) {
        score += 40; // Prefer Black Label for 1982
      }
      if (title.toLowerCase().includes("silver label") && queryLower.includes("1983")) {
        score += 40; // Prefer Silver Label for 1983
      }
      
      // Prefer results with price recommendations
      if (csp.priceRecommendations && csp.priceRecommendations.length > 0) {
        score += 20;
      }
      
      return { csp, score, title: csp.title };
    });
    
    // Sort by score (highest first)
    scored.sort((a, b) => b.score - a.score);
    
    // Show top matches if there are multiple
    if (scored.length > 1) {
      console.log(`\n📋 Found ${scored.length} matching products:`);
      scored.slice(0, 10).forEach((item, idx) => {
        const csp = item.csp;
        const hasPriceData = csp.priceRecommendations && csp.priceRecommendations.length > 0;
        const priceInfo = hasPriceData ? " (has price data)" : "";
        console.log(`   ${idx + 1}. ${item.title} (score: ${item.score}${priceInfo})`);
        if (csp.canonicalProductIds && csp.canonicalProductIds.length > 0) {
          console.log(`      ID: ${csp.canonicalProductIds[0]}`);
        }
      });
      if (scored.length > 10) {
        console.log(`   ... and ${scored.length - 10} more`);
      }
      console.log(`\n✅ Using best match: ${scored[0].title}`);
    }
    
    const best = scored[0].csp;

    return { csp: best, allMatches: scored };
  } catch (error) {
    console.error(`Error in findBestCsp for "${q}":`, error.response?.data || error.message);
    return null;
  }
}

// Normalize CSP result to handle both old and new formats
function normalizeCspResult(result) {
  if (!result) return null;
  if (result.csp) return result; // New format with matches
  // Old format - convert to new format
  return {
    csp: {
      canonicalProductIds: [result.canonicalProductId],
      title: result.title,
      brand: { name: result.brand },
      slug: result.slug,
    },
    allMatches: []
  };
}

async function fetchPriceRecords(canonicalProductId, maxRecords = 500) {
  const allRecords = [];
  let offset = 0;
  const limit = 100;

  while (allRecords.length < maxRecords) {
    const payload = {
      operationName: "Search_PriceGuideTool_TransactionTable",
      variables: {
        canonicalProductIds: [canonicalProductId],
        sellerCountries: ["US"],
        actionableStatuses: ["shipped", "picked_up", "received"],
        limit,
        offset,
      },
      query: `
        query Search_PriceGuideTool_TransactionTable($canonicalProductIds: [String], $sellerCountries: [String], $conditionSlugs: [String], $createdAfterDate: String, $actionableStatuses: [String], $limit: Int, $offset: Int) {
          priceRecordsSearch(
            input: {canonicalProductIds: $canonicalProductIds, sellerCountries: $sellerCountries, listingConditionSlugs: $conditionSlugs, createdAfterDate: $createdAfterDate, actionableStatuses: $actionableStatuses, limit: $limit, offset: $offset}
          ) {
            priceRecords {
              _id
              condition { displayName }
              createdAt { seconds }
              amountProduct { display }
              listingId
            }
          }
        }
      `,
    };

    try {
      const resp = await axios.post(GQL_URL, payload, { headers: HEADERS });
      
      // Check for API errors
      if (resp.data?.errors) {
        console.error(`   ⚠️  GraphQL errors at offset ${offset}:`, JSON.stringify(resp.data.errors, null, 2));
        break;
      }
      
      const records = resp.data?.data?.priceRecordsSearch?.priceRecords || [];
      
      if (!records.length) {
        if (offset === 0) {
          console.log(`   ⚠️  API returned empty result for canonicalProductId: ${canonicalProductId}`);
          console.log(`   Response:`, JSON.stringify(resp.data?.data || {}, null, 2).substring(0, 500));
          // Try to get more info about why it's empty
          if (resp.data?.data?.priceRecordsSearch) {
            console.log(`   priceRecordsSearch keys:`, Object.keys(resp.data.data.priceRecordsSearch));
          }
        }
        break;
      }
      
      // Log progress
      if (offset === 0) {
        console.log(`   ✅ Found ${records.length} records in first batch`);
      }

      const parsedRecords = records
        .map((r) => {
          const disp = r?.amountProduct?.display || "";
          const num = parseFloat(disp.replace(/[^0-9.]/g, ""));
          if (!Number.isFinite(num)) return null;
          return {
            _id: r._id,
            condition: r?.condition?.displayName || "Unknown",
            amount: num,
            listingId: String(r?.listingId || ""),
            createdAt: r?.createdAt?.seconds || 0,
          };
        })
        .filter(Boolean);

      allRecords.push(...parsedRecords);

      if (records.length < limit) break;
      offset += limit;
      
      await new Promise((res) => setTimeout(res, 100));
    } catch (error) {
      console.error(`Error fetching price records at offset ${offset}:`, error.message);
      break;
    }
  }

  return allRecords;
}

async function scrapeProduct(query, selectIndex = null) {
  console.log(`\n🔍 Searching for: "${query}"`);
  
  const result = await findBestCsp(query);
  if (!result) {
    console.log(`❌ No product found for "${query}"`);
    return { ok: false, query, reason: "No CSP match" };
  }

  const normalized = normalizeCspResult(result);
  if (!normalized) {
    console.log(`❌ Invalid result format`);
    return { ok: false, query, reason: "Invalid result" };
  }

  const csp = normalized.csp;
  const allMatches = normalized.allMatches || [];
  
  console.log(`✅ Selected product: ${csp.title}`);
  console.log(`   Brand: ${csp.brand?.name || csp.brand}`);
  console.log(`   Canonical Product ID: ${csp.canonicalProductIds[0]}`);
  
  // Note about year matching
  const yearMatch = query.toLowerCase().match(/\b(19|20)\d{2}\b/);
  if (yearMatch) {
    const queryYear = yearMatch[0];
    const title = csp.title || "";
    if (!title.includes(queryYear)) {
      const rangeMatch = title.match(/(\d{4})\s*-\s*(\d{4})/);
      if (rangeMatch) {
        const startYear = parseInt(rangeMatch[1]);
        const endYear = parseInt(rangeMatch[2]);
        const year = parseInt(queryYear);
        if (year >= startYear && year <= endYear) {
          console.log(`   ℹ️  Note: "${queryYear}" is within the production range "${rangeMatch[0]}" - this is the correct product!`);
        }
      }
    }
  }

  console.log(`\n📥 Fetching price records...`);
  const tx = await fetchPriceRecords(csp.canonicalProductId, 500);
  if (!tx.length) {
    console.log(`⚠️  No price guide transactions found`);
    return { ok: false, query, reason: "No price guide transactions", ...csp };
  }

  console.log(`✅ Found ${tx.length} price records`);

  // Summarize by condition
  const byCond = new Map();
  for (const t of tx) {
    const key = t.condition || "Unknown";
    if (!byCond.has(key)) byCond.set(key, []);
    byCond.get(key).push(t);
  }

  const currency = "USD";
  const allSummary = summarize(tx, currency);
  const byCondition = {};
  for (const [cond, recs] of byCond.entries()) byCondition[cond] = summarize(recs, currency);

  console.log(`\n📊 Price Summary:`);
  console.log(`   Total records: ${allSummary.count}`);
  console.log(`   Median price: $${allSummary.median}`);
  console.log(`   Average price: $${allSummary.average}`);
  console.log(`   Low: $${allSummary.low} | High: $${allSummary.high}`);

  // Save to MongoDB
  console.log(`\n💾 Saving to MongoDB...`);
  await Product.updateOne(
    { canonicalProductId },
    {
      $set: {
        canonicalProductId,
        title: csp.title || "",
        brand: csp.brand?.name || csp.brand || "",
        slug: csp.slug || "",
        normalizedTitle: normalizeTitle(csp.title || ""),
        hasPriceGuide: true,
        priceGuide: tx.slice(0, 200),
        priceGuideSummary: {
          all: allSummary,
          byCondition,
          lastUpdated: new Date(),
        },
      },
      $setOnInsert: { createdAt: new Date() },
    },
    { upsert: true }
  );

  console.log(`✅ Successfully saved to MongoDB!`);
  return { ok: true, query, canonicalProductId, txCount: tx.length, median: allSummary.median, title: csp.title };
}

async function main() {
  // Get query from command line argument
  const query = process.argv[2];
  
  if (!query) {
    console.error("❌ Please provide a product query as an argument");
    console.log("\nUsage: node scripts/scrape-specific-product.js \"1982 Ibanez TS-9\"");
    console.log("\nExample queries:");
    console.log('  node scripts/scrape-specific-product.js "1982 Ibanez TS-9"');
    console.log('  node scripts/scrape-specific-product.js "Boss BD-2 Blues Driver"');
    console.log('  node scripts/scrape-specific-product.js "Strymon Timeline"');
    process.exit(1);
  }

  await mongoose.connect(MONGO_URI);
  console.log("✅ MongoDB connected:", MONGO_URI);

  try {
    const result = await scrapeProduct(query);
    
    if (result.ok) {
      console.log(`\n✅ Successfully scraped and saved: ${result.title}`);
      console.log(`   Product ID: ${result.canonicalProductId}`);
      console.log(`   Price records: ${result.txCount}`);
      console.log(`   Median price: $${result.median}`);
    } else {
      console.log(`\n❌ Failed to scrape: ${result.reason}`);
      if (result.title) {
        console.log(`   Found product: ${result.title} but no price data`);
      }
    }
  } catch (error) {
    console.error("❌ Error:", error.message);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log("\n✅ Disconnected from MongoDB");
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
