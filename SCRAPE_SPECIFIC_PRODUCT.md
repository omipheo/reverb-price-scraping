# How to Scrape a Specific Product

## Problem

The monthly scraping script searches by brand names and generic terms (e.g., "Ibanez", "Ibanez pedal"), but it doesn't search for specific year/model combinations like "1982 Ibanez TS-9". This is why specific products might not be in your MongoDB.

## Solution

Use the `scrape-specific-product.js` script to scrape individual products by their exact search query.

## Usage

```bash
cd /root/reverb-price-scraping
node scripts/scrape-specific-product.js "1982 Ibanez TS-9"
```

## Examples

```bash
# Scrape a specific year/model
node scripts/scrape-specific-product.js "1982 Ibanez TS-9"

# Scrape by model name
node scripts/scrape-specific-product.js "Boss BD-2 Blues Driver"

# Scrape by brand and model
node scripts/scrape-specific-product.js "Strymon Timeline"

# Scrape with year
node scripts/scrape-specific-product.js "1979 Ibanez TS-808"
```

## How It Works

1. **Searches Reverb**: Uses the same GraphQL API to search for your exact query
2. **Finds Best Match**: Scores results to find the best matching product
   - Prioritizes products with price data
   - Matches year if specified in query
   - Matches model name and brand
3. **Fetches Price Data**: Gets all available price records from Reverb's price guide
4. **Saves to MongoDB**: Stores the product with full price history and summaries

## Output

The script will show:
- ✅ Found product name and brand
- ✅ Number of price records found
- ✅ Price summary (median, average, low, high)
- ✅ Success confirmation when saved to MongoDB

## Example Output

```
🔍 Searching for: "1982 Ibanez TS-9"
✅ Found product: IBANEZ TS9 Tube Screamer 1981 - 1985
   Brand: Ibanez
   Canonical Product ID: abc123...

📥 Fetching price records...
✅ Found 247 price records

📊 Price Summary:
   Total records: 247
   Median price: $125.50
   Average price: $128.75
   Low: $85.00 | High: $200.00

💾 Saving to MongoDB...
✅ Successfully saved to MongoDB!

✅ Successfully scraped and saved: IBANEZ TS9 Tube Screamer 1981 - 1985
   Product ID: abc123...
   Price records: 247
   Median price: $125.50
```

## Why This Happens

The monthly scraping script (`scrape-monthly.js`) is designed to:
- Discover products broadly by searching brand names
- Find popular/common products
- Build a comprehensive database over time

It doesn't search for specific year/model combinations because:
1. There are too many combinations to search (every year × every model)
2. It would take too long to complete
3. Many specific combinations might not have price data

## When to Use This Script

Use `scrape-specific-product.js` when:
- ✅ You need a specific product that's not in the database
- ✅ You know the exact search query that works on Reverb
- ✅ You want to add a specific product immediately
- ✅ You're testing or debugging

## Integration with Monthly Scrape

The monthly scrape will continue to run and discover products broadly. This script is for adding specific products on-demand.

## Troubleshooting

### "No product found"
- Try different search terms
- Check if the product exists on Reverb's price guide
- Try without the year: "Ibanez TS-9" instead of "1982 Ibanez TS-9"

### "No price guide transactions"
- The product exists but has no sales history in Reverb's price guide
- This is normal for rare or new products

### MongoDB connection error
- Check your `.env` file has `MONGO_URI` set correctly
- Ensure MongoDB is running: `systemctl status mongod`
