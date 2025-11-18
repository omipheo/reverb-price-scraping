// Function to scrape brands from https://reverb.com/brands

// Endpoint to fetch all brands from Reverb
// Endpoint to fetch available brands from Reverb

const axios = require("axios");
const path = require("path");
const mongoose = require('mongoose');
const Pedal = require('./model/pedals.mdl');
const cheerio = require("cheerio");
const dotenv = require('dotenv');
const fs = require('fs');
const stringSimilarity = require('string-similarity');

// Debug what's happening
console.log('=== DEBUGGING ENV LOADING ===');
console.log('Current directory:', process.cwd());
console.log('Looking for .env at:', require('path').resolve('.env'));
console.log('File exists:', require('fs').existsSync('.env'));

// Read the actual file content
const envContent = fs.readFileSync('.env', 'utf8');
console.log('Raw .env file content:');
console.log('Length:', envContent.length);
console.log('Content:', JSON.stringify(envContent));
console.log('Lines:', envContent.split('\n').length);

// Try to load .env
const result = dotenv.config();
console.log('Dotenv result:', result);

// Check if it loaded anything
console.log('All env vars with OPENAI:', Object.keys(process.env).filter(key => key.includes('OPENAI')));
console.log('OPENAI_API_KEY value:', process.env.OPENAI_API_KEY);
console.log('=== END DEBUG ===');
// Serve dashboard.html at the root URL
// GraphQL endpoint
// Try 127.0.0.1 first, fallback to localhost
const MONGO_URI = 'mongodb://127.0.0.1:27017/prices';
const MONGO_URI_FALLBACK = 'mongodb://localhost:27017/prices';

// Improved MongoDB connection with proper error handling and retry logic
async function connectWithRetry() {
	const maxRetries = 5;
	let retries = 0;
	
	while (retries < maxRetries) {
		try {
			// Try primary connection string first
			await mongoose.connect(MONGO_URI, {
				// Remove deprecated options for Mongoose 8.x
				serverSelectionTimeoutMS: 5000, // Timeout after 5s instead of 30s
				socketTimeoutMS: 45000, // Close sockets after 45s of inactivity
				connectTimeoutMS: 10000, // Give up initial connection after 10s
				maxPoolSize: 10, // Maintain up to 10 socket connections
				minPoolSize: 2, // Maintain at least 2 socket connections
				maxIdleTimeMS: 30000, // Close idle connections after 30s
				retryWrites: true,
				w: 'majority',
				// Additional options to help with connection stability
				heartbeatFrequencyMS: 10000,
				serverApi: {
					version: '1',
					strict: false,
					deprecationErrors: false
				}
			});
			console.log('✅ MongoDB connected successfully using primary URI');
			break;
		} catch (error) {
			console.error(`❌ Primary connection failed:`, error.message);
			
			// Try fallback connection string
			try {
				console.log('🔄 Trying fallback connection string...');
				await mongoose.connect(MONGO_URI_FALLBACK, {
					serverSelectionTimeoutMS: 5000,
					socketTimeoutMS: 45000,
					connectTimeoutMS: 10000,
					maxPoolSize: 10,
					minPoolSize: 2,
					maxIdleTimeMS: 30000,
					retryWrites: true,
					w: 'majority',
					heartbeatFrequencyMS: 10000,
					serverApi: {
						version: '1',
						strict: false,
						deprecationErrors: false
					}
				});
				console.log('✅ MongoDB connected successfully using fallback URI');
				break;
			} catch (fallbackError) {
				retries++;
				console.error(`❌ MongoDB connection attempt ${retries} failed:`, fallbackError.message);
				
				if (retries < maxRetries) {
					console.log(`🔄 Retrying in 5 seconds... (${retries}/${maxRetries})`);
					await new Promise(resolve => setTimeout(resolve, 5000));
				} else {
					console.error('❌ Failed to connect to MongoDB after all retries');
					console.error('💡 Please check:');
					console.error('   1. Is MongoDB running? (mongod)');
					console.error('   2. Is it listening on port 27017?');
					console.error('   3. Are there any firewall issues?');
					process.exit(1);
				}
			}
		}
	}
}

// Start connection with retry
connectWithRetry();

// Wait for database connection before starting server
async function startServer() {
    try {
        // Wait for MongoDB to be ready
        while (mongoose.connection.readyState !== 1) {
            console.log('⏳ Waiting for MongoDB connection...');
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
        
        console.log('🚀 Starting Express server...');
        app.listen(PORT, () => {
            console.log(`✅ Server running on port ${PORT}`);
        });
        
    } catch (error) {
        console.error('❌ Failed to start server:', error);
        process.exit(1);
    }
}

// Start server after database connection
startServer();

mongoose.connection.on('connected', () => {
	console.log('✅ MongoDB connected successfully');
});

mongoose.connection.on('error', (err) => {
	console.error('❌ MongoDB connection error:', err);
});

mongoose.connection.on('disconnected', () => {
	console.log('⚠️ MongoDB disconnected');
});

mongoose.connection.on('reconnected', () => {
	console.log('🔄 MongoDB reconnected');
});

// Auto-reconnect on disconnection
mongoose.connection.on('disconnected', () => {
	console.log('⚠️ MongoDB disconnected, attempting to reconnect...');
	setTimeout(() => {
		if (mongoose.connection.readyState === 0) {
			console.log('🔄 Attempting to reconnect to MongoDB...');
			connectWithRetry();
		}
	}, 5000);
});

// Periodic connection health check
setInterval(() => {
    const readyState = mongoose.connection.readyState;
    const statusMap = {
        0: 'disconnected',
        1: 'connected',
        2: 'connecting',
        3: 'disconnecting'
    };
    
    if (readyState !== 1) {
        console.log(`⚠️ Database health check: ${statusMap[readyState]} (${readyState})`);
        
        // Try to reconnect if disconnected
        if (readyState === 0) {
            console.log('🔄 Health check triggered reconnection attempt...');
            connectWithRetry();
        }
    }
}, 30000); // Check every 30 seconds

// Handle process termination
process.on('SIGINT', async () => {
	try {
		await mongoose.connection.close();
		console.log('MongoDB connection closed through app termination');
		process.exit(0);
	} catch (err) {
		console.error('Error closing MongoDB connection:', err);
		process.exit(1);
	}
});


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

// New /search endpoint for Reverb Combined Marketplace Search
app.post("/initial", async (req, res) => {
	try {
		// Check if MongoDB is connected before proceeding
		if (mongoose.connection.readyState !== 1) {
			return res.status(500).json({ error: 'Database not connected. Please try again.' });
		}
		
		// await Pedal.updateMany({ cp_ids: { $exists: true, $not: { $size: 0 } } }, { $set: { cp_ids: [] } });

		// await Pedal.updateMany({ cp_ids: { $exists: true, $not: { $size: 0 } } }, { $set: { cp_ids: [], priceGuide: [] } });
		
		// await getCanonicalProductId(count)

		// Process price guides and wait for completion
		await getProductsPriceGuide(0)
// 45500
		// Process existing pedals in batches to verify they are actually guitar pedals
		// await processExistingPedalsInBatches();
		// console.log('✅ Database cleared successfully');
		
		// Return success response after processing completes
		res.json({ 
			success: true, 
			message: 'Backend data refreshed successfully',
			timestamp: new Date().toISOString()
		});
		
	} catch (error) {
		console.error('❌ Error in /initial endpoint:', error);
		res.status(500).json({ 
			success: false,
			error: 'Failed to refresh backend data',
			message: error.message 
		});
	}
})	

var searchedPedals = []
app.post("/search", async (req, res) => {
	try {
		// Check if MongoDB is connected before proceeding
		if (mongoose.connection.readyState !== 1) {
			return res.status(503).json({ error: 'Database not connected. Please try again.' });
		}
		
		// Extract pagination parameters
		const page = parseInt(req.body.page) || 1;
		const limit = parseInt(req.body.limit) || 10;
		const skip = (page - 1) * limit;
		
		// Extract price guide filter parameter (all, with, without)
		const priceGuideFilter = req.body.priceGuideFilter || 'all';
		
		// Validate pagination parameters
		if (page < 1) {
			return res.status(400).json({ error: 'Page must be greater than 0' });
		}
		
		let pedals = [];
		if (req.body && Array.isArray(req.body.pedals)) {
			pedals = req.body.pedals;
		} else if (req.body && typeof req.body.pedals === "string") {
			try {
				pedals = JSON.parse(req.body.pedals);
			} catch (parseError) {
				console.error('Failed to parse pedals:', parseError);
				return res.status(400).json({ error: 'Invalid pedals format' });
			}
		}
		
		if (!pedals || pedals.length === 0) {
			return res.status(400).json({ error: 'No pedals provided' });
		}
		
		let foundPedals = [];
		if (!req.body.toPage) {
			var titles = [];
			pedals.forEach((pedal) => {
				titles.push(pedal.name);
			});
			
			// Use $where with proper variable scoping by embedding the data + pagination
			foundPedals = await Pedal.find({
				$where: function() {
					// Embed the pedals data directly in the query
					const searchPedals = JSON.parse('{{PEDALS_DATA}}');
					let flag = false;

					for (var i = 0; i < searchPedals.length; i++) {
						var strArr = searchPedals[i].name.toLowerCase().split(" ");
						var similarity = 0;
						var s = 1 / strArr.length;
						
						var titleLength = this.title.split(" ").length;
						if (titleLength < strArr.length / 2) continue;
						strArr.forEach((str) => {
							if (this.title.toLowerCase().includes(str)) {
								similarity += s;
							}
						});
						
						if (similarity > 0.9 && this.condition.display_name.toLowerCase() === searchPedals[i].condition.toLowerCase()) {
							flag = true;
							break;
						}
					}
					return flag;
				}.toString().replace('{{PEDALS_DATA}}', JSON.stringify(pedals))
			})
			.sort({ price: 1 }); // Sort by price ascending
		}
		else {
			foundPedals = searchedPedals.slice()
		}
	
	// Calculate statistics for all found pedals (before filtering)
	const totalWithPriceGuide = foundPedals.filter(p => p.priceGuide && p.priceGuide.length > 0).length;
	const totalWithoutPriceGuide = foundPedals.length - totalWithPriceGuide;
	
	console.log(0)
	// Apply price guide filter if specified
	if (priceGuideFilter === 'with') {
		foundPedals = foundPedals.filter(p => p.priceGuide && p.priceGuide.length > 0);
	} else if (priceGuideFilter === 'without') {
		foundPedals = foundPedals.filter(p => !p.priceGuide || p.priceGuide.length === 0);
	}
	
	console.log(1)
	// Sort by price guide status (those with guide first), then by price
	foundPedals.sort((a, b) => {
		const aHasGuide = a.priceGuide && a.priceGuide.length > 0;
		const bHasGuide = b.priceGuide && b.priceGuide.length > 0;
		
		if (aHasGuide === bHasGuide) {
			return a.price.amount - b.price.amount; // Sort by price if same guide status
		}
		return aHasGuide ? -1 : 1; // Those with guide come first
	});
	
	console.log(2)
	// Calculate pagination metadata from filtered results
	const totalCount = foundPedals.length;
	const totalPages = Math.ceil(totalCount / limit);
	const hasNextPage = page < totalPages;
	const hasPrevPage = page > 1;
	if (!req.body.toPage) searchedPedals = foundPedals.slice();
	// Apply pagination to results
	const paginatedPedals = foundPedals.slice(skip, skip + limit);
		
		console.log(paginatedPedals.length)
		if (paginatedPedals.length > 0) {
			var products = []
			paginatedPedals.forEach((item, i) => {
				products.push({
					id: skip + i + 1, // Global ID across all pages
					title: item.title,
					brand: item.brand,
					productId: item.productId,
					price: item.price,
					priceGuide: item.priceGuide,
					condition: item.condition,
					url: item.url,
					photos: item.photos
				});
			});
			
		return res.json({ 
			products,
			pagination: {
				currentPage: page,
				totalPages: totalPages,
				totalItems: totalCount,
				itemsPerPage: limit,
				hasNextPage: hasNextPage,
				hasPrevPage: hasPrevPage,
				nextPage: hasNextPage ? page + 1 : null,
				prevPage: hasPrevPage ? page - 1 : null
			},
			statistics: {
				totalAll: totalWithPriceGuide + totalWithoutPriceGuide,
				totalWithPriceGuide: totalWithPriceGuide,
				totalWithoutPriceGuide: totalWithoutPriceGuide
			}
		});
	} else {
		return res.status(404).json({ 
			error: "No pedals found",
			pagination: {
				currentPage: page,
				totalPages: 0,
				totalItems: 0,
				itemsPerPage: limit,
				hasNextPage: false,
				hasPrevPage: false,
				nextPage: null,
				prevPage: null
			},
			statistics: {
				totalAll: totalWithPriceGuide + totalWithoutPriceGuide,
				totalWithPriceGuide: totalWithPriceGuide,
				totalWithoutPriceGuide: totalWithoutPriceGuide
			}
		});
	}
	} catch (err) {
		console.error("❌ Error fetching pedals:", err);
		return res.status(500).json({ error: "Internal server error" });
	}
});

const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());
const { title } = require("process");
async function scrapeBrandsFromWeb() {
	const brands = require('fs').readFileSync('brands_debug.txt', 'utf8');
	return JSON.parse(brands);
}

const accessToken = '0e5ce3b5378045fd27810212c28ad211ae420fa5515a0a56aded4b9fd402cbd0';

const traitValues = {
	"novo": "novo-1",
	"jet": "jet-1",
	"rebelrelic": "rebelrelic-1"
}
const getProducts = async (brand) => {
	let brandName = brand.url.split('/').pop();
	// if (!brand.name.includes(" ")) {
	// 	brandName = brand.name.toLocaleLowerCase();
	// }
	console.log('🎸 Brands Found:', brandName);
	brandName = brandName.split("--")[0];
	brandName = traitValues[brandName] || brandName;
	var page = 0, total = 0, priceQuery = [], step = 0;
	var testResponse = await axios.get('https://api.reverb.com/api/listings', {
		headers: {
			'Authorization': `Bearer ${accessToken}`,
			'Accept': 'application/hal+json',
			'Content-Type': 'application/json',
			'Accept-Version': '3.0'
		},
		params: {
			make: brandName,   // You can change this
			page: page + 1,
			per_page: 50              // Max 100 per page
		}
	})
	if (testResponse.data.total == 0) {
		step--;
	}
	if (testResponse.data.total >= 20000) {
		priceQuery = [{ price_min: 0, price_max: 10 }, { price_min: 10.001, price_max: 20 }, { price_min: 20.001, price_max: 50 }, { price_min: 50.001, price_max: 100 },
			{ price_min: 100.001, price_max: 200 }, { price_min: 200.001, price_max: 500 }, { price_min: 500.001, price_max: 1000 }, { price_min: 1000.001, price_max: 2000 }, 
			{ price_min: 2000.001, price_max: 5000 }, { price_min: 5000.001, price_max: 10000 }, { price_min: 10000.001, price_max: 20000 }, {price_min: 20000.001, price_max: 100000}]
		step = priceQuery.length - 1;
		console.log("Step 1: Price range set to 0-10");
	}
	while (step >= 0) {
		while ((page == 0 || page * 50 < total) && page < 400) {
			try {
				var response = await axios.get('https://api.reverb.com/api/listings', {
					headers: {
						'Authorization': `Bearer ${accessToken}`,
						'Accept': 'application/hal+json',
						'Content-Type': 'application/json',
						'Accept-Version': '3.0'
					},
					params: {
						make: brandName,   // You can change this
						page: page + 1,
						per_page: 50,
						...priceQuery[priceQuery.length - step - 1]
					}
				})
				var total = response.data.total
				const listings = response.data.listings;
				// Process listings in batches to avoid overwhelming the database
				const batchSize = 10;
				console.log(listings[3])
				for (let i = 0; i < listings.length; i += batchSize) {
					const batch = listings.slice(i, i + batchSize);
					
					try {
						// Check connection before each batch
						if (mongoose.connection.readyState !== 1) {
							console.log('⚠️ Database disconnected, skipping batch');
							continue;
						}
						
						// Process batch with Promise.all for better performance
						await Promise.all(batch.map(async (item) => {
							const title = item.title;
							
							try {
								// Use upsert to update existing pedal or create new one
								// await Pedal.findOneAndUpdate(
								// 	{ productId: item.id }, // filter by productId to find existing
								// 	{
								// 		title,
								// 		brand: brand.name,
								// 		productId: item.id,
								// 		price: item.price,
								// 		condition: item.condition,
								// 		url: item._links.web.href,
								// 		photos: item.photos,
								// 	},
								// 	{ 
								// 		upsert: true, 
								// 		new: true, // return the updated/created document
								// 		setDefaultsOnInsert: true // apply schema defaults on insert
								// 	}
								// );
							} catch (dbError) {
								console.error(`❌ Database error for item ${item.id}:`, dbError.message);
							}
						}));
						
						// Small delay between batches to prevent overwhelming the database
						if (i + batchSize < listings.length) {
							await new Promise(resolve => setTimeout(resolve, 100));
						}
					} catch (batchError) {
						console.error(`❌ Batch processing error:`, batchError.message);
					}
				}
				if (total > page * 50 || total == 0) {
					console.log(total - page * 50, page);
					page++;
					// fetchListings();
				}
			} catch (error) {
				console.error("Error 123 listings:", error.response?.data || error.message);
			}
		}
		page = 0;
		step--;
	}

}
const getCanonicalProductId = async (skip) => {
	var products = await Pedal.find({}).limit(1000).skip(skip)
	for (var product of products) {
		await gett(product)
	}
	console.log("finished", skip)
	if (products.length > 0) {
		await getCanonicalProductId(skip + 1000)
	}
	console.log("All are finished", skip)
}
const testFindFavorite = async (product) => {
	try {
		const listingsSearchRequest = {
			"categorySlugs": [],
			"brandSlugs": [],
			"conditionSlugs": [],
			"shippingRegionCodes": [],
			"itemState": [],
			"itemCity": [],
			"curatedSetSlugs": [],
			"saleSlugs": [],
			"cspSlug": product.csp.slug,
			"withProximityFilter": {
				"proximity": false
			},
			"boostedItemRegionCode": "",
			"traitValues": [],
			"excludeCategoryUuids": [],
			"excludeBrandSlugs": [],
			"likelihoodToSellExperimentGroup": 0,
			"countryOfOrigin": [],
			"contexts": [],
			"autodirects": "IMPROVED_DATA",
			"multiClientExperiments": [],
			"canonicalFinishes": [],
			"skipAutocorrect": false,
			"limit": 45,
			"offset": 0,
			"fallbackToOr": true,
			"collapsible": null,
			"cpNewConditionAndTnpFeaturedWinnerRanks": null,
			"sort": "NONE"
		};

		const operationName = "Core_FindFavorite";
		const query = `query Core_FindFavorite($listingsSearchRequest: Input_reverb_search_ListingsSearchRequest, $shopSlug: String) {
			findFavorite(
				input: {listingsSearchRequest: $listingsSearchRequest, shopSlug: $shopSlug}
			) {
				isFavorite
				canFavorite
				favorite {
					id
					favorited
					searchableId
					searchableType
					title
					emailEnabled
					feedEnabled
					queryParams
					subtitle
					link {
						href
						__typename
					}
					__typename
				}
				__typename
			}
		}`;

		const variables = {
			listingsSearchRequest,
		};

		try {
			const response = await axios.post('https://gql.reverb.com/graphql', {
				operationName,
				query,
				variables
			}, {
				headers: {
					'Content-Type': 'application/json',
					'Accept': 'application/json',
				}
			});

			if (response.data.data && response.data.data.findFavorite && response.data.data.findFavorite.favorite && response.data.data.findFavorite.favorite.queryParams) {
				var queryParams = JSON.parse(response.data.data.findFavorite.favorite.queryParams)
				product.cp_ids = queryParams["cp_ids"]
				console.log(product.cp_ids)
				await product.save()
			}
		} catch (error) {
			console.log(`❌ Skipping FindFavorite for "${product.title}":`, error.message);
			// Continue processing other products
		}
	} catch (error) {
		console.log(`❌ Skipping FindFavorite for "${product.title}":`, error.message);
		// Continue processing other products
	}
}

async function gett(product) {
	try {
		const response = await axios.get('https://api.reverb.com/api/priceguide',
		{
			headers: {
				'Authorization': `Bearer ${accessToken}`,
				'Content-Type': 'application/json',
				'Accept': 'application/json',
				'Accept-Version': '3.0'
			},
			params: {
				query: product.title,
				make: "Boss",
			}
		});
		if (response.data.price_guides.length > 0) {
			var similarity = 0;
			var priceGuide = {};
			response.data.price_guides.forEach(p => {
				var s = stringSimilarity.compareTwoStrings(p.title, product.title)
				if (s > 0.9 && s > similarity) {
					similarity = s;
					priceGuide = p;
				}
			})
			if (priceGuide.comparison_shopping_page_id) {
				product.csp.id = priceGuide.comparison_shopping_page_id
				await testProductReviews(product)
			}
		}
		else {
			console.log("No price guide found for", product.title)
		}
	} catch (error) {
		console.log(`❌ Skipping "${product.title}" due to error:`, error.message);
		// Continue processing other products
	}
}

const getProductReviews = async (product, offset = 0, verified = false, ratings = null, sort = null, fullTextQuery = null) => {
	const operationName = "Core_Product_Reviews";
	const query = `query Core_Product_Reviews($cspId: String, $offset: Int, $ratings: [reverb_search_ProductReviewsSearchRequest_Rating], $verified: Boolean, $sort: reverb_search_ProductReviewsSearchRequest_Sort, $fullTextQuery: String) {
		csp(input: {id: $cspId}) {
			_id
			...ProductReviewCSPFields
			productReviewSearch(
				input: {sort: $sort, ratings: $ratings, verified: $verified, limit: 5, offset: $offset, fullTextQuery: $fullTextQuery}
			) {
				total
				productReviews {
					_id
					...ProductReviewCardFields
					__typename
				}
				filters {
					...ProductReviewFilterFields
					__typename
				}
				__typename
			}
			statsSearch: productReviewSearch(input: {limit: 0}) {
				stats {
					total
					averageRating
					ratingsDistribution {
						rating
						reviewCount
						__typename
					}
					__typename
				}
				__typename
			}
			__typename
		}
	}

	fragment ProductReviewCardFields on ProductReview {
		_id
		id
		title
		body
		rating
		createdAt
		voteCount
		verified
		voted
		isMyReview
		reported
		reviewer {
			shortname
			links {
				avatar {
					href
					__typename
				}
				__typename
			}
			__typename
		}
		__typename
	}

	fragment ProductReviewFilterFields on reverb_search_Filter {
		name
		key
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
			optionValue
			__typename
		}
		__typename
	}

	fragment ProductReviewCSPFields on CSP {
		_id
		id
		slug
		title
		myReview {
			id
			body
			title
			rating
			__typename
		}
		__typename
	}`;

	const variables = {
		cspId: product.csp.id,
		offset,
		verified,
		ratings,
		sort,
		fullTextQuery
	};

	try {
		const response = await axios.post('https://gql.reverb.com/graphql', {
			operationName,
			query,
			variables
		}, {
			headers: {
				'Content-Type': 'application/json',
				'Accept': 'application/json',
			}
		});
		if (response.data.data && response.data.data.csp) {
			product.csp.slug = response.data.data.csp.slug
			await testFindFavorite(product)
		}
		else {
			console.log('No product reviews found for', product.title)
		}
	} catch (error) {
		console.log(`❌ Skipping GraphQL for "${product.title}":`, error.message);
		// Continue processing other products
	}
}

// Test the product reviews query
const testProductReviews = async (product) => {
	try {
		await getProductReviews(product, 0, false);
	} catch (error) {
		console.error('Product Reviews test failed:', error.message);
	}
}

// Process brands in batches to save OpenAI tokens
async function processBrandsInBatches(brands, batchSize = 10) {
    const pedalBrands = [];
    
    for (let i = 0; i < brands.length; i += batchSize) {
        const batch = brands.slice(i, i + batchSize);
        console.log(`Processing batch ${Math.floor(i/batchSize) + 1}/${Math.ceil(brands.length/batchSize)}`);
        
        const batchResults = await analyzeBrandBatch(batch);
        pedalBrands.push(...batchResults);
        
        // Small delay to avoid rate limiting
        if (i + batchSize < brands.length) {
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
    }
    
    return pedalBrands;
}

// Analyze a batch of brands in one API call
async function analyzeBrandBatch(brandsBatch) {
    try {
        const brandsList = brandsBatch.map((brand, index) => `${index + 1}. "${brand.name}"`).join('\n');
        const prompt = `Analyze these ${brandsBatch.length} brands and determine which are focused on guitar pedals/effects.

Brands to analyze:
${brandsList}

For each brand, determine if it's primarily focused on guitar pedals/effects.

Respond with ONLY a JSON array:
[
  {
    "index": 1,
    "brandName": "brand name",
    "isPedalBrand": true/false,
    "confidence": 0.0-1.0,
    "reason": "Brief explanation"
  }
]

Only mark as pedal brands if they primarily make guitar pedals/effects.`;

        const response = await fetch("https://api.openai.com/v1/chat/completions", {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                model: "gpt-3.5-turbo",
                messages: [
                    {
                        role: "system",
                        content: "You are a music equipment expert. Analyze brands and determine which are primarily focused on guitar pedals/effects."
                    },
                    {
                        role: "user",
                        content: prompt
                    }
                ],
                temperature: 0.1,
                max_tokens: 800
            })
        });

        const data = await response.json();
        
        if (data.error) {
            console.error('OpenAI API Error:', data.error);
            return [];
        }

        const content = data.choices[0].message.content;
        
        try {
            const jsonMatch = content.match(/\[[\s\S]*\]/);
            if (jsonMatch) {
                const results = JSON.parse(jsonMatch[0]);
				console.log(results)
                return results
                    .filter(result => result.isPedalBrand && result.confidence > 0.6)
                    .map(result => ({
                        ...brandsBatch[result.index - 1],
                        confidence: result.confidence,
                        reason: result.reason
                    }));
            }
        } catch (parseError) {
            console.error('Failed to parse OpenAI response:', parseError);
        }
        
        console.log('Returning empty array due to parsing failure');
        return [];
        
    } catch (error) {
        console.error('Batch analysis failed:', error);
        return [];
    }
}

// Process existing pedals in batches to verify they are actually guitar pedals
async function processExistingPedalsInBatches(batchSize = 10) {
    try {
        console.log('🔍 Starting verification of existing pedals...');
        
        let skip = 0;
        let batchNumber = 1;
        let totalProcessed = 0;
        let totalRemoved = 0;
        
        while (true) {
            // Fetch only 10 pedals at a time from MongoDB
            const batch = await Pedal.find({}).skip(skip).limit(batchSize).exec();
			let deleteIds = [];
            if (batch.length === 0) {
                console.log('✅ No more pedals to process');
                break;
            }
            
            console.log(`Processing batch ${batchNumber} (${batch.length} pedals)...`);
            
            // Prepare batch for analysis
            const batchForAnalysis = batch.map(pedal => ({ name: pedal.title }));
            
            // Analyze the batch
            const analysisResults = await analyzePedalBatch(batchForAnalysis);
            
            // Find pedals that were NOT identified as actual guitar pedals
            const validPedalNames = analysisResults.map(result => result.name);
            const invalidPedals = batch.filter(pedal => !validPedalNames.includes(pedal.title));
            
            if (invalidPedals.length > 0) {
                console.log(`❌ Found ${invalidPedals.length} invalid pedals in this batch:`);
                invalidPedals.forEach(pedal => {
                    console.log(`  - ${pedal.title}`);
                });
                
                // Remove invalid pedals from database immediately
                invalidPedals.map(pedal => deleteIds.push(pedal._id));
                
            } else {
                console.log(`✅ All pedals in this batch are valid guitar pedals`);
            }
			const deleteResult = await Pedal.deleteMany({ _id: { $in: deleteIds } });   
			totalRemoved += deleteResult.deletedCount;
			console.log(`🗑️ Removed ${deleteResult.deletedCount} invalid pedals from database`);         
            totalProcessed += batch.length;
            skip += batchSize - deleteResult.deletedCount;
            batchNumber++;
            
            // Small delay to avoid rate limiting
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
        
		
        console.log(`🎉 Processing complete! Total processed: ${totalProcessed}, Total removed: ${totalRemoved}`);
        
    } catch (error) {
        console.error('Error processing existing pedals:', error);
    }
}

// Analyze a batch of pedal names in one API call
async function analyzePedalBatch(pedalsBatch) {
    try {
        const pedalsList = pedalsBatch.map((pedal, index) => `${index + 1}. "${pedal.name}"`).join('\n');
        const prompt = `Analyze these ${pedalsBatch.length} product names and determine which are guitar pedals/effects.

Products to analyze:
${pedalsList}

For each product, determine if it's a guitar pedal/effect unit.

Respond with ONLY a JSON array:
[
  {
    "index": 1,
    "productName": "product name",
    "isPedal": true/false,
    "confidence": 0.0-1.0,
    "reason": "Brief explanation"
  }
]

Only mark as pedals if they are guitar pedals/effects units. Include distortion, overdrive, delay, reverb, modulation, EQ, compressor, and other guitar effects pedals.`;

        const response = await fetch("https://api.openai.com/v1/chat/completions", {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                model: "gpt-3.5-turbo",
                messages: [
                    {
                        role: "system",
                        content: "You are a music equipment expert. Analyze product names and determine which are guitar pedals/effects units."
                    },
                    {
                        role: "user",
                        content: prompt
                    }
                ],
                temperature: 0.1,
                max_tokens: 800
            })
        });

        const data = await response.json();
        
        if (data.error) {
            console.error('OpenAI API Error:', data.error);
            return [];
        }

        const content = data.choices[0].message.content;
        
        try {
            const jsonMatch = content.match(/\[[\s\S]*\]/);
            if (jsonMatch) {
                const results = JSON.parse(jsonMatch[0]);
                console.log(results);
                return results
                    .filter(result => result.isPedal && result.confidence > 0.6)
                    .map(result => ({
                        ...pedalsBatch[result.index - 1],
                        confidence: result.confidence,
                        reason: result.reason
                    }));
            }
        } catch (parseError) {
            console.error('Failed to parse OpenAI response:', parseError);
        }
        
        console.log('Returning empty array due to parsing failure');
        return [];
        
    } catch (error) {
        console.error('Pedal batch analysis failed:', error);
        return [];
    }
}

const fetchListings = async (req, res) => {
	try {
		let brands = await scrapeBrandsFromWeb();
		console.log(`Found ${brands.length} brands, processing in batches...`);
		
		// Process brands in batches instead of one by one
		const pedalBrands = await processBrandsInBatches(brands, 10);
		
		console.log(`Found ${pedalBrands.length} pedal brands out of ${brands.length} total brands`);
		
		// Process only the pedal brands
		for (const brand of pedalBrands) {
			await getProducts(brand);
		}
		
		res.json({
			totalBrands: brands.length,
			pedalBrands: pedalBrands.length,
			brands: pedalBrands
		});
		
	} catch (error) {
		console.error("Error fetching listings:", error.response?.data || error.message);
		res.status(500).json({ error: 'Internal server error' });
	}
};
// Function to check if a brand is specifically for guitar pedals
async function isGuitarPedalBrand(brandName) {
    if (!brandName) return false;
    
    try {
        const prompt = `Analyze if the brand "${brandName}" is specifically focused on guitar pedals/effects or if it's a general music equipment brand.
		Consider:
		1. Is this brand primarily known for guitar pedals/effects?
		2. Do they specialize in stompboxes, effects processors, or guitar effects?
		3. Or are they known for guitars, amps, keyboards, recording equipment, etc.?

		Respond with ONLY a JSON object in this exact format:
		{
		"isPedalBrand": true/false,
		"confidence": 0.0-1.0,
		"reason": "Brief explanation of why this brand is or isn't pedal-focused"
		}

		Examples:
		- "Boss" should return: {"isPedalBrand": true, "confidence": 1.0, "reason": "Boss is primarily known for guitar pedals and effects"}
		- "Fender" should return: {"isPedalBrand": false, "confidence": 0.8, "reason": "Fender is primarily known for guitars and amplifiers, not pedals"}
		- "Strymon" should return: {"isPedalBrand": true, "confidence": 1.0, "reason": "Strymon specializes in high-end guitar pedals and effects"}`;

        const response = await fetch("https://api.openai.com/v1/chat/completions", {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                model: "gpt-3.5-turbo",
                messages: [
                    {
                        role: "system",
                        content: "You are a music equipment expert specializing in guitar pedals and effects. Analyze brands and determine if they are primarily focused on guitar pedals/effects."
                    },
                    {
                        role: "user",
                        content: prompt
                    }
                ],
                temperature: 0.1,
                max_tokens: 200
            })
        });

        const data = await response.json();
        
        if (data.error) {
            console.error('OpenAI API Error:', data.error);
            // Fallback to basic keyword checking
            return fallbackBrandCheck(brandName);
        }

        const content = data.choices[0].message.content;
        console.log(content)
        try {
            // Extract JSON from the response
            const jsonMatch = content.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                const result = JSON.parse(jsonMatch[0]);
                return result;
            } else {
                console.error('No JSON found in OpenAI response:', content);
                return fallbackBrandCheck(brandName);
            }
        } catch (parseError) {
            console.error('Failed to parse OpenAI response:', parseError);
            return fallbackBrandCheck(brandName);
        }

    } catch (error) {
        console.error('OpenAI API request failed:', error);
        // Fallback to basic keyword checking
        return fallbackBrandCheck(brandName);
    }
}
// Fallback function for when OpenAI API fails
function fallbackBrandCheck(brandName) {
    if (!brandName) return { isPedalBrand: false, confidence: 0.3, reason: 'No brand name provided' };
    
    const normalizedBrand = brandName.toLowerCase().trim();
    
    // Basic keyword checking as fallback
    const pedalKeywords = ['pedal', 'effect', 'fx', 'stompbox', 'stomp'];
    const hasPedalKeywords = pedalKeywords.some(keyword => normalizedBrand.includes(keyword));
    
    if (hasPedalKeywords) {
        return { isPedalBrand: true, confidence: 0.6, reason: 'Brand name contains pedal-related keywords (fallback)' };
    }
    
    return { isPedalBrand: false, confidence: 0.3, reason: 'Unknown brand, no pedal indicators found (fallback)' };
}


// fetchListings()
// Function to fetch all brands from Reverb (all pages, not an API endpoint)
// var page = 0;
// const fetchListings = async (req, res) => {
//   try {
// 	axios.post('https://gql.reverb.com/graphql', {
// 	  operationName: "Core_Marketplace_CombinedMarketplaceSearch",
// 	  variables: {
// 		inputListings: {
// 		  query: "BOSS",
// 		  categorySlugs: [],
// 		  brandSlugs: [],
// 		  conditionSlugs: [],
// 		  shippingRegionCodes: [],
// 		  itemState: [],
// 		  itemCity: [],
// 		  curatedSetSlugs: [],
// 		  saleSlugs: [],
// 		  withProximityFilter: { proximity: false },
// 		  boostedItemRegionCode: "US",
// 		  useExperimentalRecall: true,
// 		  traitValues: [],
// 		  excludeCategoryUuids: [],
// 		  excludeBrandSlugs: [],
// 		  likelihoodToSellExperimentGroup: 3,
// 		  countryOfOrigin: [],
// 		  contexts: ["INITIAL_QUERY"],
// 		  autodirects: "IMPROVED_DATA",
// 		  multiClientExperiments: [{ name: "spell_check_autocorrect", group: "1" }],
// 		  canonicalFinishes: [],
// 		  skipAutocorrect: false,
// 		  limit: 50,
// 		  offset: page * 50,
// 		  fallbackToOr: true,
// 		  collapsible: "CANONICAL_PRODUCT_NEW_CONDITION_AND_TNP"
// 		}
// 	},
// 	query: `query Core_Marketplace_CombinedMarketplaceSearch($inputListings: Input_reverb_search_ListingsSearchRequest) {
// 	  listingsSearch(input: $inputListings) {
// 		total
// 		offset
// 		limit
// 		listings {
// 		  _id
// 		  title
// 		  condition {
// 			displayName
// 		  }
// 		  price {
// 			amount
// 			display
// 			currency
// 		  }
// 		}
// 	  }
// 	}`,

//   })
// 	.then((response) => {
// 	  // TODO: handle response.data as needed
// 	  console.log(response.data.data);
// 		const {listingsSearch} = response.data.data;
// 		const {listings, total} = listingsSearch;
// 		console.log(listings[0])
// 		listings.forEach(item => {
// 			const title = item.title;
// 			const newPedal = new Pedal({
// 				title,
// 				brand: item.brand,
// 				productId: item.id,
// 				price: item.price,
// 				condition: item.condition,
// 				url: item._links.web.href,
// 				photos: item.photos.map(photo => photo.url),
// 			});
// 			// newPedal.save();
// 		});
// 		if (total > page * 50) {
// 			console.log(total, listings.length);
// 			page++;	
// 			fetchListings();
// 		}
// 		else {
// 			res.status(200).json({ message: 'Listings fetched successfully' });
// 		}
// 	})
// 	.catch((error) => {
// 	  console.error('API Error:', error.response?.data || error.message);
// 	  res.status(500).json({ error: 'Failed to fetch listings' });
// 	});
//   } catch (error) {
// 	console.error('API Error:', error);
// 	res.status(500).json({ error: 'Internal server error' });
//   }
// };
// fetchListings();

// Server startup is now handled by startServer() function

// Price Guide Transaction Table endpoint
async function getProductsPriceGuide(skip = 0) {
	var products = await Pedal.find({}).limit(1000).skip(skip)
	console.log(products)
	console.log(`Processing batch starting at ${skip}, ${products.length} products`);
	for (var product of products) {
		await getPriceGuide(product)
	}
	if (products.length > 0) {
		await getProductsPriceGuide(skip + 1000)
	} else {
		console.log("✅ All price guides processed successfully");
	}
}

async function getPriceGuide(product) {
	try {
		const payload = {
			operationName: "Search_PriceGuideTool_TransactionTable",
			variables: {
				canonicalProductIds: product.cp_ids,
				conditionSlugs: [
					product.condition.slug
				],
				sellerCountries: [
					"US"
				],
				actionableStatuses: [
					"shipped",
					"picked_up",
					"received"
				],
				limit: 30,
				offset: 0
			},
			query: "query Search_PriceGuideTool_TransactionTable($canonicalProductIds: [String], $sellerCountries: [String], $conditionSlugs: [String], $createdAfterDate: String, $actionableStatuses: [String], $limit: Int, $offset: Int) {\n  priceRecordsSearch(\n    input: {canonicalProductIds: $canonicalProductIds, sellerCountries: $sellerCountries, listingConditionSlugs: $conditionSlugs, createdAfterDate: $createdAfterDate, actionableStatuses: $actionableStatuses, limit: $limit, offset: $offset}\n  ) {\n    priceRecords {\n      _id\n      ...TransactionTablePriceRecordsData\n      __typename\n    }\n    total\n    offset\n    __typename\n  }\n}\n\nfragment TransactionTablePriceRecordsData on PublicPriceRecord {\n  _id\n  condition {\n    displayName\n    __typename\n  }\n  createdAt {\n    seconds\n    __typename\n  }\n  amountProduct {\n    display\n    __typename\n  }\n  listingId\n  __typename\n}"
		};

		const response = await axios.post('https://gql.reverb.com/graphql', payload);
		if (!response.data.data.priceRecordsSearch || response.data.data.priceRecordsSearch.priceRecords.length == 0) {
			console.log('No price guide found for product:', product.productId);
			product.keywords = [];
			await product.save();
			// await Pedal.deleteOne({productId: product.productId})
			return;
		}
	product.priceGuide = [];
	response.data.data.priceRecordsSearch.priceRecords.forEach(priceRecord => {
		if (priceRecord.amountProduct && priceRecord.amountProduct.display.includes("$")) {
			var number = parseFloat(priceRecord.amountProduct.display.replace("$", "").replace(",", ""));
			// Only add to priceGuide if the parsed number is valid
			if (!isNaN(number) && isFinite(number)) {
				product.priceGuide.push({
					_id: priceRecord._id,
					condition: priceRecord.condition.displayName,
					amount: number,
					listingId: priceRecord.listingId,
					createdAt: priceRecord.createdAt.seconds
				});
			} else {
				console.log(`⚠️ Skipping invalid price for ${product.title}: "${priceRecord.amountProduct.display}"`);
			}
		}
	});
		console.log('Price Guide found for product:', product.priceGuide.length);
		product.keywords = [];
		await product.save();
	} catch (error) {
		console.error('Price Guide API Error:', error.response?.data || error.message);
	}
}