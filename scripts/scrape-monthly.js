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
  // Don't normalize - use query as-is
  const q = query;

  // Try the exact format from reference code
  const payload = {
    operationName: "Core_SellFlow_Search",
    variables: {
      offset: 0,
      sellCardLimit: 9,
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
      includePriceRecommendations: true,  // Changed to true like reference
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
    const best = csps.find((c) => Array.isArray(c.canonicalProductIds) && c.canonicalProductIds.length);
    if (!best) return null;

    return {
      canonicalProductId: String(best.canonicalProductIds[0]),
      title: best.title || "",
      brand: best.brand?.name || "",
      slug: best.slug || "",
      normalizedTitle: normalizeTitle(best.title || ""),
    };
  } catch (error) {
    console.error(`Error in findBestCsp for "${q}":`, error.response?.data || error.message);
    return null;
  }
}

// Discover all CSPs for a given query with pagination
// Based on reference code, try the exact query structure they use
async function discoverAllCsps(query, maxResults = 1000, useExcludedCategories = false) {
  // Use query as-is (don't normalize) - normalization was causing 0 results
  const q = query.trim();
  const allCsps = [];
  let offset = 0;
  const limit = 50; // Max per request

  while (allCsps.length < maxResults) {
    const variables = {
      offset,
      sellCardLimit: limit,
      q,
      decades: null,
      finishes: null,
      brandNames: null,
      category_uuids: null,
      boostByClicks: null,
      fullTextQueryOperand: "AND",
      sort: "RECENT_ORDERS_COUNT_USED_DESC",
      fuzzy: true,
      listingsThatShipTo: "XX",
      hasExpressSaleBid: false,
    };
    
    // Only add excludedCategoryUuids if requested (they might be filtering out everything)
    if (useExcludedCategories) {
      variables.excludedCategoryUuids = [
        "7681b711-435c-4923-bdc3-65076d15d78c",
        "98a45e2d-2cc2-4b17-b695-a5d198c8f6d3",
        "4ca6d5e9-f00f-468d-bcae-8c7497537281",
        "22af0079-d5e7-48d1-9e5c-108105a2156c",
      ];
    }
    
    // Use the exact query structure from reference code
    // Use simplified query format - removed unused variables
    const queryString = useExcludedCategories 
      ? `query Core_SellFlow_Search($q: String, $decades: [String], $finishes: [String], $brandNames: [String], $category_uuids: [String], $sellCardLimit: Int, $excludedCategoryUuids: [String], $boostByClicks: Boolean, $fullTextQueryOperand: reverb_search_FullTextQueryOperand, $sort: reverb_search_CSPSearchRequest_Sort, $fuzzy: Boolean, $offset: Int, $listingsThatShipTo: String, $hasExpressSaleBid: Boolean!) {
          cspSearch(
            input: {fullTextQuery: $q, decades: $decades, finishes: $finishes, brandNames: $brandNames, categoryUuids: $category_uuids, withAggregations: [CATEGORY_UUIDS, FINISHES, DECADES, BRAND_NAMES], excludedCategoryUuids: $excludedCategoryUuids, limit: $sellCardLimit, offset: $offset, boostByClicks: $boostByClicks, fullTextQueryOperand: $fullTextQueryOperand, sort: $sort, fuzzy: $fuzzy, listingsThatShipTo: $listingsThatShipTo, hasExpressSaleBid: $hasExpressSaleBid}
          ) {
            csps {
              _id
              id
              title
              slug
              brand {
                _id
                name
                __typename
              }
              canonicalProductIds
              __typename
            }
            total
            offset
            limit
            __typename
          }
        }`
      : `query Core_SellFlow_Search($q: String, $decades: [String], $finishes: [String], $brandNames: [String], $category_uuids: [String], $sellCardLimit: Int, $boostByClicks: Boolean, $fullTextQueryOperand: reverb_search_FullTextQueryOperand, $sort: reverb_search_CSPSearchRequest_Sort, $fuzzy: Boolean, $offset: Int, $listingsThatShipTo: String, $hasExpressSaleBid: Boolean!) {
          cspSearch(
            input: {fullTextQuery: $q, decades: $decades, finishes: $finishes, brandNames: $brandNames, categoryUuids: $category_uuids, withAggregations: [CATEGORY_UUIDS, FINISHES, DECADES, BRAND_NAMES], limit: $sellCardLimit, offset: $offset, boostByClicks: $boostByClicks, fullTextQueryOperand: $fullTextQueryOperand, sort: $sort, fuzzy: $fuzzy, listingsThatShipTo: $listingsThatShipTo, hasExpressSaleBid: $hasExpressSaleBid}
          ) {
            csps {
              _id
              id
              title
              slug
              brand {
                _id
                name
                __typename
              }
              canonicalProductIds
              __typename
            }
            total
            offset
            limit
            __typename
          }
        }`;
    
    const payload = {
      operationName: "Core_SellFlow_Search",
      variables,
      query: queryString,
    };

    try {
      const resp = await axios.post(GQL_URL, payload, { headers: HEADERS });
      
      // Check for errors in response
      if (resp.data?.errors) {
        console.error(`   GraphQL errors:`, JSON.stringify(resp.data.errors, null, 2));
        break;
      }
      
      // Check if data exists
      if (!resp.data?.data) {
        console.error(`   No data in response:`, JSON.stringify(resp.data, null, 2).substring(0, 500));
        break;
      }
      
      const csps = resp.data?.data?.cspSearch?.csps || [];
      const total = resp.data?.data?.cspSearch?.total || 0;
      
      // Debug: log response for first query of each search term
      if (offset === 0) {
        console.log(`   Debug: Query="${q}", Total available=${total}, Found in this page=${csps.length}`);
        if (total === 0 && csps.length === 0) {
          // Try to understand why - check if response structure is different
          console.log(`   Response status: ${resp.status}`);
          console.log(`   Response data keys:`, Object.keys(resp.data || {}));
          if (resp.data?.data) {
            console.log(`   Response data.data keys:`, Object.keys(resp.data.data));
          }
          if (resp.data?.data && !resp.data.data.cspSearch) {
            console.log(`   ⚠️ Response structure unexpected. Available keys:`, Object.keys(resp.data.data));
            // Log first 1000 chars of response for debugging
            console.log(`   Full response (first 1000 chars):`, JSON.stringify(resp.data, null, 2).substring(0, 1000));
          }
          if (resp.data?.errors) {
            console.log(`   GraphQL Errors:`, JSON.stringify(resp.data.errors, null, 2));
          }
        }
      }
      
      if (!csps.length) {
        break; // No more results
      }

      for (const csp of csps) {
        if (Array.isArray(csp.canonicalProductIds) && csp.canonicalProductIds.length) {
          const canonicalProductId = String(csp.canonicalProductIds[0]);
          // Avoid duplicates
          if (!allCsps.find(c => c.canonicalProductId === canonicalProductId)) {
            allCsps.push({
              canonicalProductId,
              title: csp.title || "",
              brand: csp.brand?.name || "",
              slug: csp.slug || "",
              normalizedTitle: normalizeTitle(csp.title || ""),
            });
          }
        }
      }

      if (csps.length < limit) break; // Last page
      offset += limit;
      
      // Be polite with rate limiting
      await new Promise((res) => setTimeout(res, 300));
    } catch (error) {
      console.error(`Error discovering CSPs for query "${query}" at offset ${offset}:`, error.response?.data || error.message);
      break;
    }
  }

  return allCsps;
}

async function fetchPriceRecords(canonicalProductId, maxRecords = 500) {
  const allRecords = [];
  let offset = 0;
  const limit = 100; // Max per request

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
      const records = resp.data?.data?.priceRecordsSearch?.priceRecords || [];
      
      if (!records.length) break; // No more results

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

      if (records.length < limit) break; // Last page
      offset += limit;
      
      // Small delay between pagination requests
      await new Promise((res) => setTimeout(res, 100));
    } catch (error) {
      console.error(`Error fetching price records at offset ${offset}:`, error.message);
      break;
    }
  }

  return allRecords;
}

async function upsertProduct(query) {
  const csp = await findBestCsp(query);
  if (!csp) return { ok: false, query, reason: "No CSP match" };

  const tx = await fetchPriceRecords(csp.canonicalProductId, 500);
  if (!tx.length) return { ok: false, query, reason: "No price guide transactions", ...csp };

  // summaries
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

  await Product.updateOne(
    { canonicalProductId: csp.canonicalProductId },
    {
      $set: {
        ...csp,
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

  return { ok: true, query, canonicalProductId: csp.canonicalProductId, txCount: tx.length, median: allSummary.median };
}

// Upsert product directly from CSP data (for discovered products)
async function upsertProductFromCsp(csp) {
  const tx = await fetchPriceRecords(csp.canonicalProductId, 500);
  if (!tx.length) return { ok: false, reason: "No price guide transactions", ...csp };

  // summaries
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

  await Product.updateOne(
    { canonicalProductId: csp.canonicalProductId },
    {
      $set: {
        ...csp,
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

  return { ok: true, canonicalProductId: csp.canonicalProductId, txCount: tx.length, median: allSummary.median, title: csp.title };
}

async function main() {
  await mongoose.connect(MONGO_URI);
  console.log("✅ Mongo connected:", MONGO_URI);
  
  // Extract database name from MONGO_URI for display
  const dbName = MONGO_URI.split('/').pop().split('?')[0] || 'pedal_prices_v2';
  
  // Create database immediately by creating the collection
  // This ensures the database exists in MongoDB Compass right away
  try {
    // Create a temporary document and immediately delete it to create the database/collection
    await Product.create({
      canonicalProductId: "__init__",
      title: "Initialization",
      brand: "System",
      slug: "init",
      normalizedTitle: "initialization",
      hasPriceGuide: false,
      priceGuide: [],
      priceGuideSummary: { all: {}, byCondition: {} }
    });
    await Product.deleteOne({ canonicalProductId: "__init__" });
    console.log(`📦 Database '${dbName}' and collection 'products' created!`);
    console.log(`   ✅ You should now see '${dbName}' database in MongoDB Compass`);
    console.log("   💡 Refresh MongoDB Compass (F5) if you don't see it yet");
  } catch (error) {
    console.log("⚠️ Could not create database immediately:", error.message);
    console.log("   Database will be created when first product is saved");
  }

  // Load all brands from brands_debug.txt
  const fs = require("fs");
  const path = require("path");
  const brandsFilePath = path.join(__dirname, "..", "brands_debug.txt");
  let allBrands = [];
  
  try {
    const brandsData = fs.readFileSync(brandsFilePath, "utf8");
    const brandsJson = JSON.parse(brandsData);
    allBrands = brandsJson.map(b => b.name).filter(Boolean);
    console.log(`📋 Loaded ${allBrands.length} brands from brands_debug.txt`);
  } catch (error) {
    console.warn(`⚠️ Could not load brands file, using fallback list:`, error.message);
    // Fallback to popular brands if file not found
    allBrands = [
      "Boss", "Ibanez", "Electro-Harmonix", "MXR", "TC Electronic", "Strymon",
      "EarthQuaker", "JHS", "Wampler", "Keeley", "Catalinbread", "Walrus Audio",
      "Chase Bliss", "Eventide", "Line 6", "DigiTech", "Fulltone", "Dunlop", "Vox", "Ernie Ball"
    ];
  }

  // Strategy: Use multiple search queries to discover all guitar pedals
  // Based on reference code, try brand names alone first (without "pedal" suffix)
  const discoveryQueries = [
    "guitar pedal",
    "effects pedal",
    "distortion",
    "delay",
    "reverb",
    "overdrive",
    "fuzz",
    "chorus",
    "wah",
    "compressor",
    "modulation",
    "boost",
    "tremolo",
    "phaser",
    "flanger",
    "looper",
    "tuner",
    "volume pedal",
    "eq",
    "filter",
    "stompbox",
  ];

  // Search by ALL brands - try brand name alone first (like reference code)
  const brandQueries = [];
  for (const brand of allBrands) {
    // Try brand name alone first (most common format)
    brandQueries.push(brand);
    // Also try with "pedal" for brands that might need it
    if (!brand.toLowerCase().includes('pedal') && !brand.toLowerCase().includes('effects')) {
      brandQueries.push(`${brand} pedal`);
    }
  }

  // Combine all discovery queries
  const allDiscoveryQueries = [...discoveryQueries, ...brandQueries];

  console.log(`🔍 Starting discovery phase with ${allDiscoveryQueries.length} search queries...`);
  console.log(`   Using ${allBrands.length} brands + ${discoveryQueries.length} generic terms`);
  
  const discoveredProducts = new Map(); // Use Map to avoid duplicates by canonicalProductId
  const savedProductIds = new Set(); // Track which products have been saved to avoid re-saving

  // Test with multiple query formats and configurations
  console.log(`\n🧪 Testing API with different configurations...`);
  
  // Test 1: Try without excludedCategoryUuids
  console.log(`\n   Test 1: GraphQL query without excludedCategoryUuids...`);
  try {
    const testPayload = {
      operationName: "Core_SellFlow_Search",
      variables: {
        offset: 0,
        sellCardLimit: 10,
        q: "Boss",
        fullTextQueryOperand: "AND",
        sort: "RECENT_ORDERS_COUNT_USED_DESC",
        fuzzy: true,
        listingsThatShipTo: "XX",
        hasExpressSaleBid: false,
      },
      query: `
        query Core_SellFlow_Search($q: String, $sellCardLimit: Int, $offset: Int, $fullTextQueryOperand: reverb_search_FullTextQueryOperand, $sort: reverb_search_CSPSearchRequest_Sort, $fuzzy: Boolean, $listingsThatShipTo: String, $hasExpressSaleBid: Boolean!) {
          cspSearch(
            input: {fullTextQuery: $q, limit: $sellCardLimit, offset: $offset, fullTextQueryOperand: $fullTextQueryOperand, sort: $sort, fuzzy: $fuzzy, listingsThatShipTo: $listingsThatShipTo, hasExpressSaleBid: $hasExpressSaleBid}
          ) {
            csps {
              title
              slug
              brand { name }
              canonicalProductIds
            }
            total
          }
        }
      `,
    };
    const testResp = await axios.post(GQL_URL, testPayload, { headers: HEADERS });
    const testTotal = testResp.data?.data?.cspSearch?.total || 0;
    const testCsps = testResp.data?.data?.cspSearch?.csps || [];
    console.log(`   GraphQL Result: Total=${testTotal}, Found=${testCsps.length}`);
    if (testCsps.length > 0) {
      console.log(`   ✅ GraphQL SUCCESS! Sample: ${testCsps[0]?.title || 'N/A'}`);
    } else {
      console.log(`   ❌ GraphQL returned 0 results`);
      if (testResp.data?.errors) {
        console.log(`   GraphQL Errors:`, JSON.stringify(testResp.data.errors, null, 2));
      }
      // Try alternative: use REST API approach from reference code
      console.log(`\n   Test 2: Trying alternative approach - checking if we need different method...`);
    }
  } catch (error) {
    console.error(`   ❌ GraphQL test failed:`, error.response?.data || error.message);
  }

  // Phase 1: Discover all products
  // First, try a few test queries to see what works
  let useExcludedCategories = false;
  let foundWorkingFormat = false;
  
  const testQueries = ["Boss", "Boss BD-2", "guitar pedal", "distortion"];
  console.log(`\n🧪 Testing different query formats to find what works...`);
  
  for (const testQuery of testQueries) {
    console.log(`   Testing: "${testQuery}"`);
    const testResult = await discoverAllCsps(testQuery, 5, false);
    if (testResult.length > 0) {
      console.log(`   ✅ SUCCESS! Found ${testResult.length} products for "${testQuery}"`);
      console.log(`   Sample: ${testResult[0]?.title || 'N/A'}`);
      useExcludedCategories = false;
      foundWorkingFormat = true;
      break;
    } else {
      console.log(`   ❌ No results for "${testQuery}"`);
    }
  }
  
  if (!foundWorkingFormat) {
    console.log(`\n   ⚠️ All test queries returned 0 results.`);
    console.log(`   This suggests the GraphQL API might:`);
    console.log(`   1. Require authentication/session`);
    console.log(`   2. Have changed its structure`);
    console.log(`   3. Need different query format`);
    console.log(`\n   Trying with excludedCategoryUuids as fallback...`);
    useExcludedCategories = true;
    
    // Try one more test with excludedCategoryUuids
    const testWithExcluded = await discoverAllCsps("Boss", 5, true);
    if (testWithExcluded.length > 0) {
      console.log(`   ✅ Found ${testWithExcluded.length} products WITH excludedCategoryUuids`);
      foundWorkingFormat = true;
    } else {
      console.log(`   ❌ Still 0 results even with excludedCategoryUuids`);
      console.log(`\n   ⚠️ CRITICAL: GraphQL CSP search is not returning any results.`);
      console.log(`   You may need to:`);
      console.log(`   1. Check if Reverb API requires authentication`);
      console.log(`   2. Use the REST API approach from your old code`);
      console.log(`   3. Verify the API endpoint is still working`);
      console.log(`\n   Continuing anyway to see full error output...`);
    }
  }

  // Process queries in parallel batches for much faster execution
  const CONCURRENT_QUERIES = 5; // Process 5 queries at the same time
  const BATCH_SIZE = 50; // Process 50 queries, then save batch
  
  console.log(`\n⚡ Using parallel processing: ${CONCURRENT_QUERIES} queries concurrently`);
  console.log(`   This will be ~${CONCURRENT_QUERIES}x faster than sequential processing\n`);

  for (let batchStart = 0; batchStart < allDiscoveryQueries.length; batchStart += BATCH_SIZE) {
    const batchEnd = Math.min(batchStart + BATCH_SIZE, allDiscoveryQueries.length);
    const batch = allDiscoveryQueries.slice(batchStart, batchEnd);
    
    console.log(`\n📦 Processing batch ${Math.floor(batchStart/BATCH_SIZE) + 1}/${Math.ceil(allDiscoveryQueries.length/BATCH_SIZE)} (queries ${batchStart + 1}-${batchEnd})`);
    
    // Process queries in parallel with concurrency limit
    const processQuery = async (query, index) => {
      try {
        const csps = await discoverAllCsps(query, 2000, useExcludedCategories);
        return { query, csps, success: true };
      } catch (error) {
        console.error(`   ⚠️ Error for "${query}":`, error.message);
        return { query, csps: [], success: false };
      }
    };
    
    // Process in chunks of CONCURRENT_QUERIES
    for (let i = 0; i < batch.length; i += CONCURRENT_QUERIES) {
      const chunk = batch.slice(i, i + CONCURRENT_QUERIES);
      const results = await Promise.all(chunk.map((q, idx) => processQuery(q, i + idx)));
      
      // Aggregate results
      for (const result of results) {
        if (result.success) {
          for (const csp of result.csps) {
            if (!discoveredProducts.has(csp.canonicalProductId)) {
              discoveredProducts.set(csp.canonicalProductId, csp);
            }
          }
        }
      }
      
      const currentQuery = batchStart + i + chunk.length;
      console.log(`   ✅ Processed ${currentQuery}/${allDiscoveryQueries.length} queries, ${discoveredProducts.size} unique products`);
      
      // Small delay between chunks to respect rate limits
      if (i + CONCURRENT_QUERIES < batch.length) {
        await new Promise((res) => setTimeout(res, 200));
      }
    }
    
    // Save products after each batch
    const newProducts = Array.from(discoveredProducts.values()).filter(
      p => !savedProductIds.has(p.canonicalProductId)
    );
    
    if (newProducts.length > 0) {
      const productsToSave = savedProductIds.size === 0 
        ? newProducts.slice(0, Math.min(10, newProducts.length)) // Save first 10 immediately
        : newProducts.slice(0, 200); // Then save in batches of 200
      
      console.log(`   💾 Saving ${productsToSave.length} products to MongoDB...`);
      let savedInBatch = 0;
      for (const product of productsToSave) {
        try {
          const result = await upsertProductFromCsp(product);
          if (result.ok) {
            savedProductIds.add(product.canonicalProductId);
            savedInBatch++;
          }
          await new Promise((res) => setTimeout(res, 50)); // Reduced delay for parallel processing
        } catch (err) {
          // Continue with other products if one fails
        }
      }
      console.log(`   ✅ Saved ${savedInBatch} products! Total saved: ${savedProductIds.size}`);
    }
  }

  console.log(`\n✅ Discovery complete! Found ${discoveredProducts.size} unique products`);
  
  if (discoveredProducts.size === 0) {
    console.log(`\n⚠️ WARNING: No products discovered. Cannot proceed to scraping phase.`);
    console.log(`   Please check the API responses above for errors.`);
    await mongoose.disconnect();
    return;
  }
  
  console.log(`\n📥 Starting price data scraping phase...`);
  console.log(`   Products will be saved to: ${dbName}.products`);
  console.log(`   Check MongoDB Compass for database '${dbName}'`);

  // Phase 2: Scrape price data for all discovered products (parallel processing)
  const products = Array.from(discoveredProducts.values());
  const CONCURRENT_SCRAPES = 3; // Process 3 products concurrently (price fetching is heavier)
  const SCRAPE_BATCH_SIZE = 100;
  
  console.log(`\n⚡ Phase 2: Using parallel processing (${CONCURRENT_SCRAPES} concurrent scrapes)`);
  
  let successCount = 0;
  let failCount = 0;

  for (let batchStart = 0; batchStart < products.length; batchStart += SCRAPE_BATCH_SIZE) {
    const batchEnd = Math.min(batchStart + SCRAPE_BATCH_SIZE, products.length);
    const batch = products.slice(batchStart, batchEnd);
    
    console.log(`\n📦 Scraping batch ${Math.floor(batchStart/SCRAPE_BATCH_SIZE) + 1}/${Math.ceil(products.length/SCRAPE_BATCH_SIZE)} (${batchStart + 1}-${batchEnd} of ${products.length})`);
    
    // Process products in parallel with concurrency limit
    for (let i = 0; i < batch.length; i += CONCURRENT_SCRAPES) {
      const chunk = batch.slice(i, i + CONCURRENT_SCRAPES);
      const results = await Promise.all(
        chunk.map(async (product) => {
          try {
            const result = await upsertProductFromCsp(product);
            if (result.ok) {
              return { success: true, product: product.title || product.canonicalProductId, txCount: result.txCount, median: result.median };
            } else {
              return { success: false, product: product.title || product.canonicalProductId, reason: result.reason };
            }
          } catch (error) {
            return { success: false, product: product.title || product.canonicalProductId, error: error.message };
          }
        })
      );
      
      // Count results
      for (const result of results) {
        if (result.success) {
          successCount++;
          if ((successCount + failCount) % 10 === 0) {
            console.log(`   ✅ Progress: ${successCount} saved, ${failCount} failed (${successCount + failCount}/${products.length})`);
          }
        } else {
          failCount++;
        }
      }
      
      // Small delay between chunks
      if (i + CONCURRENT_SCRAPES < batch.length) {
        await new Promise((res) => setTimeout(res, 150));
      }
    }
    
    console.log(`   📊 Batch complete: ${successCount} saved, ${failCount} failed`);
  }

  console.log(`\n✅ Scraping complete!`);
  console.log(`   Success: ${successCount}`);
  console.log(`   Failed: ${failCount}`);
  console.log(`   Total: ${products.length}`);

  await mongoose.disconnect();
  console.log("\nDone.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
