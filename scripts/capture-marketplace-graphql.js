/**
 * Capture the GraphQL request payload when loading Reverb marketplace sold listings
 * and save it to marketplace-sold-payload.json for use by scrape-marketplace-sold.js.
 *
 * Run once: node scripts/capture-marketplace-graphql.js
 *
 * Injects a fetch hook in the page to capture POST bodies to gql.reverb.com (works in headless).
 */

const fs = require("fs");
const path = require("path");
const puppeteer = require("puppeteer");

const MARKETPLACE_URL =
  "https://reverb.com/marketplace?query=ts9&make=ibanez&product_type=effects-and-pedals&show_only_sold=true";

const PAYLOAD_PATH = path.join(__dirname, "marketplace-sold-payload.json");

const TARGET_OPERATION = "Core_Marketplace_CombinedMarketplaceSearch";

(async () => {
  const browser = await puppeteer.launch({
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
    ],
  });

  let saved = null;

  try {
    const page = await browser.newPage();

    await page.setRequestInterception(true);
    const graphqlBodies = [];
    page.on("request", (request) => {
      const url = request.url();
      const method = request.method();
      if (url === "https://gql.reverb.com/graphql" && method === "POST") {
        const postData = request.postData();
        if (postData) {
          try {
            const body = JSON.parse(postData);
            graphqlBodies.push(body);
          } catch (e) {}
        }
      }
      request.continue();
    });

    await page.evaluateOnNewDocument(() => {
      window.__graphqlPayloads = [];
      const nativeFetch = window.fetch;
      window.fetch = function (input, init) {
        const url = typeof input === "string" ? input : (input && input.url);
        if (url && url.includes("gql.reverb.com/graphql") && init && init.method === "POST" && init.body) {
          try {
            const body = typeof init.body === "string" ? JSON.parse(init.body) : null;
            if (body) window.__graphqlPayloads.push(body);
          } catch (e) {}
        }
        return nativeFetch.apply(this, arguments);
      };
    });

    await page.goto(MARKETPLACE_URL, {
      waitUntil: "domcontentloaded",
      timeout: 30000,
    });

    await new Promise((r) => setTimeout(r, 12000));

    const fromPage = await page.evaluate(() => (window.__graphqlPayloads || []));
    const all = [...graphqlBodies, ...fromPage];

    for (const body of all) {
      if (body.operationName === TARGET_OPERATION && body.query) {
        saved = {
          operationName: body.operationName,
          query: body.query,
          sampleVariables: body.variables || {},
        };
        break;
      }
    }
    if (!saved && all.length) {
      const withQuery = all.find((b) => b.query && (b.operationName || "").includes("Marketplace"));
      if (withQuery) {
        saved = {
          operationName: withQuery.operationName || TARGET_OPERATION,
          query: withQuery.query,
          sampleVariables: withQuery.variables || {},
        };
      }
    }
  } finally {
    await browser.close();
  }

  if (saved) {
    fs.writeFileSync(PAYLOAD_PATH, JSON.stringify(saved, null, 2), "utf8");
    console.log("Saved payload to", PAYLOAD_PATH);
    console.log("  operationName:", saved.operationName);
    console.log("  query length:", saved.query.length);
    console.log("  sampleVariables keys:", Object.keys(saved.sampleVariables || {}).join(", "));
  } else {
    console.log("No matching GraphQL request captured.");
    console.log("Create payload manually: see scripts/HOW_TO_GET_GRAPHQL_PAYLOAD.txt");
    console.log("Then: node scripts/create-marketplace-payload.js <path-to-pasted-json>");
    process.exit(1);
  }
})();
