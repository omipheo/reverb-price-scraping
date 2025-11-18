const axios = require("axios");
const path = require("path");

// Serve dashboard.html at the root URL

// GraphQL endpoint
const GQL_URL = "https://gql.reverb.com/graphql";

// List of pedals to search for (as slugs)
// const pedals = [
//   {name:"Boss BD-2 Blues Driver", value:"Very good"},
//   {name:"Boss TU-3 Chromatic Tuner", value:"Excellent"},
//   {name:"Boss DS-1 Distortion", value:"Excellent"},
//   {name:"Boss RC-1 Loop Station", value:"Excellent"},
//   {name:"Boss Loop Station", value:"Excellent"},
// ];

const express = require("express");
const app = express();
const PORT = process.env.PORT || 80;
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
// Serve static files from /public (Heroku compatible)
app.use(express.static(path.join(__dirname, "public")));
console.log(path.join(__dirname, "public"));
// Default route serves dashboard.html from /public
app.get("/", (req, res) => {
	res.sendFile(path.join(__dirname, "public", "dashboard.html"));
});
async function getProducts() {
	products.forEach(async (pedal) => {
		const canonicalProductId = pedal.canonicalProductId;
		const countryCode = "US";
		const priceQuery = {
			operationName: "DataServices_PriceGuideToolEstimatesContainer",
			query: `query DataServices_PriceGuideToolEstimatesContainer($priceRecommendationQueries: [Input_reverb_pricing_PriceRecommendationQuery]) {\n  priceRecommendations(\n    input: {priceRecommendationQueries: $priceRecommendationQueries}\n  ) {\n    priceRecommendations {\n      priceLow {\n        amountCents\n        currency\n        __typename\n      }\n      priceMiddle {\n        amountCents\n        currency\n        __typename\n      }\n      priceHigh {\n        amountCents\n        currency\n        __typename\n      }\n      priceMiddleThirtyDaysAgo {\n        amountCents\n        currency\n        __typename\n      }\n      __typename\n    }\n    __typename\n  }\n}`,
			variables: {
				priceRecommendationQueries: [
					{
						canonicalProductId,
						conditionUuid,
						countryCode,
					},
				],
			},
		};
		const priceResponse = await axios.post(GQL_URL, priceQuery, {
			headers: {
				"Content-Type": "application/json",
				"User-Agent":
					"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
			},
		});
		const priceData =
			priceResponse.data?.data?.priceRecommendations?.priceRecommendations?.[0];
		results.push({
			pedal: csp.title,
			brand: csp.brand?.name,
			productId: canonicalProductId,
			condition: pedal.condition,
			priceLow: priceData ? priceData.priceLow.amountCents / 100 : null,
			priceMiddle: priceData ? priceData.priceMiddle.amountCents / 100 : null,
			priceHigh: priceData ? priceData.priceHigh.amountCents / 100 : null,
			priceMiddleThirtyDaysAgo:
				priceData && priceData.priceMiddleThirtyDaysAgo
					? priceData.priceMiddleThirtyDaysAgo.amountCents / 100
					: null,
			currency: priceData ? priceData.priceLow.currency : null,
		});
		if (results.length === products.length) {
			// Send the results back to the client
			console.log(results);
		}
	})
}

// New /search endpoint for Reverb Combined Marketplace Search
app.post("/search", async (req, res) => {
	let pedals = [];
	if (req.body && Array.isArray(req.body.pedals)) {
		pedals = req.body.pedals;
	} else if (req.body && typeof req.body.pedals === "string") {
		try {
			pedals = JSON.parse(req.body.pedals);
		} catch { }
	}
	if (!Array.isArray(pedals) || pedals.length === 0) {
		return res.status(400).json({ error: "No pedals provided" });
	}
	products = []; // Reset products array
	searchProducts(pedals, 0, res);
	// Convert pedal name to slug
});

var products = [];
async function searchProducts(pedals, i, res) {
	// This function is called to search products for each pedal
	// It can be used to handle pagination or other logic if needed
	let pedal = pedals[i];
	let brand = pedal.name.split(" ")[0].toLowerCase();
	const payload = {
		operationName: "Core_SellFlow_Search",
		variables: {
			offset: 0,
			sellCardLimit: 9,
			q: pedal.name,
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
		query:
			'query Core_SellFlow_Search($q: String, $decades: [String], $finishes: [String], $brandNames: [String], $category_uuids: [String], $sellCardLimit: Int, $excludedCategoryUuids: [String], $boostByClicks: Boolean, $fullTextQueryOperand: reverb_search_FullTextQueryOperand, $sort: reverb_search_CSPSearchRequest_Sort, $fuzzy: Boolean, $offset: Int, $listingsThatShipTo: String, $hasExpressSaleBid: Boolean!, $includePriceRecommendations: Boolean!, $priceRecommendationCountryCode: String) {\n  cspSearch(\n    input: {fullTextQuery: $q, decades: $decades, finishes: $finishes, brandNames: $brandNames, categoryUuids: $category_uuids, withAggregations: [CATEGORY_UUIDS, FINISHES, DECADES, BRAND_NAMES], excludedCategoryUuids: $excludedCategoryUuids, limit: $sellCardLimit, offset: $offset, boostByClicks: $boostByClicks, fullTextQueryOperand: $fullTextQueryOperand, sort: $sort, fuzzy: $fuzzy, listingsThatShipTo: $listingsThatShipTo, hasExpressSaleBid: $hasExpressSaleBid}\n  ) {\n    filters {\n      ...FlatFilter\n      __typename\n    }\n    csps {\n      _id\n      ...SellCardData\n      ...CSPPriceRecommendationData @include(if: $includePriceRecommendations)\n      ...ExpressSaleItemBidData @include(if: $hasExpressSaleBid)\n      __typename\n    }\n    total\n    offset\n    limit\n    __typename\n  }\n}\n\nfragment FlatFilter on reverb_search_Filter {\n  name\n  key\n  aggregationName\n  widgetType\n  options {\n    count {\n      value\n      __typename\n    }\n    name\n    selected\n    paramName\n    setValues\n    unsetValues\n    all\n    optionValue\n    __typename\n  }\n  __typename\n}\n\nfragment SellCardData on CSP {\n  _id\n  id\n  title\n  finishes\n  image(input: {transform: "card_square"}) {\n    _id\n    source\n    __typename\n  }\n  slug\n  brand {\n    _id\n    name\n    __typename\n  }\n  canonicalProductIds\n  isTradeInEligible\n  __typename\n}\n\nfragment CSPPriceRecommendationData on CSP {\n  _id\n  priceRecommendations(\n    input: {conditionUuids: ["f7a3f48c-972a-44c6-b01a-0cd27488d3f6", "ac5b9c1e-dc78-466d-b0b3-7cf712967a48"], countryCode: $priceRecommendationCountryCode}\n  ) {\n    conditionUuid\n    priceLow {\n      amountCents\n      amount\n      currency\n      __typename\n    }\n    priceHigh {\n      amountCents\n      amount\n      currency\n      __typename\n    }\n    __typename\n  }\n  __typename\n}\n\nfragment ExpressSaleItemBidData on CSP {\n  _id\n  expressSalePriceEstimate(\n    input: {conditionUuid: "ae4d9114-1bd7-4ec5-a4ba-6653af5ac84d"}\n  ) {\n    priceLow {\n      amountCents\n      currency\n      __typename\n    }\n    priceHigh {\n      amountCents\n      currency\n      __typename\n    }\n    __typename\n  }\n  expressSaleItemBid {\n    cspUuid\n    bidId\n    carrier\n    shopName\n    estimatedPayout {\n      display\n      amount\n      __typename\n    }\n    __typename\n  }\n  __typename\n}',
	};
	try {
		const response = await axios.post(
			"https://gql.reverb.com/graphql",
			payload
		);
		var { data } = response.data;
		var { cspSearch } = data;
		var { csps } = cspSearch;
		csps.forEach((csp) => {
			products.push({
				title: csp.title,
				condition: pedal.condition,
				brand: csp.brand.name,
				slug: csp.slug,
				id: csp.id,
				canonicalProductId: csp.canonicalProductIds[0],
				priceLow:
					csp.priceRecommendations?.priceLow?.amountCents / 100 || "N/A",
				priceHigh:
					csp.priceRecommendations?.priceHigh?.amountCents / 100 || "N/A",
			});
		});
		if (i !== pedals.length - 1) {
			console.log("products", products);
			searchProducts(pedals, i + 1, res);
		} else {
			getProducts();
		}
		// if (i == pedals.length - 1) {
		// 	console.log("products", products);
		// }
	} catch (error) {
		console.error("API Error:", error.response?.data || error.message);
	}
}

app.listen(PORT, () => {
	console.log(`Server running on port ${PORT}`);
});
