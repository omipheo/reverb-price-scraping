/**
 * Build marketplace-sold-payload.json from the raw GraphQL payload copied from Chrome.
 *
 * 1. In Chrome: DevTools -> Network -> filter "graphql" -> refresh page
 *    -> click the graphql POST -> Payload tab -> copy the full Request Payload (JSON).
 * 2. Save it to a file, e.g. pasted-payload.json (or pass as first arg).
 * 3. Run: node scripts/create-marketplace-payload.js [path/to/pasted-payload.json]
 *
 * If no file path is given, reads from stdin (paste JSON and Ctrl+D).
 */

const fs = require("fs");
const path = require("path");

const PAYLOAD_PATH = path.join(__dirname, "marketplace-sold-payload.json");
const TARGET = "Core_Marketplace_CombinedMarketplaceSearch";

function main() {
  const file = process.argv[2];
  if (file) {
    const raw = fs.readFileSync(file, "utf8");
    run(raw);
  } else {
    const chunks = [];
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (c) => chunks.push(c));
    process.stdin.on("end", () => run(chunks.join("")));
  }
}

function run(raw) {
  let body;
  try {
    body = JSON.parse(raw.trim());
  } catch (e) {
    console.error("Invalid JSON:", e.message);
    process.exit(1);
  }

  const op = body.operationName;
  if (op !== TARGET) {
    console.warn("Expected operationName:", TARGET, "got:", op);
  }

  const out = {
    operationName: body.operationName || TARGET,
    query: body.query,
    sampleVariables: body.variables || {},
  };

  if (!out.query) {
    console.error("No 'query' in payload.");
    process.exit(1);
  }

  fs.writeFileSync(PAYLOAD_PATH, JSON.stringify(out, null, 2), "utf8");
  console.log("Wrote", PAYLOAD_PATH);
  console.log("  operationName:", out.operationName);
  console.log("  query length:", out.query.length);
  console.log("  sampleVariables keys:", Object.keys(out.sampleVariables).join(", "));
}

main();
