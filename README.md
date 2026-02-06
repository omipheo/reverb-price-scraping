# Reverb Price Scraping & Pricing Tool

A Node.js application for scraping Reverb.com price data and providing a pricing tool for music pedals.

## Features

- **Price Scraping**: Automated scraping of Reverb.com price guide data
- **Pricing Tool**: Web-based interface for calculating pedal prices
- **User Management**: Authentication and user sessions
- **Excel Import/Export**: Upload spreadsheets and download results
- **Price Matching**: Intelligent matching of pedal names to products
- **PTM Pricing**: Buy and sell price management with expiration dates

## Project Structure

```
├── config/          # Configuration (database, session)
├── controllers/     # Route handlers
├── middleware/      # Express middleware (auth, upload)
├── model/           # MongoDB models
├── public/          # Frontend (HTML, CSS, JS)
├── routes/          # Route definitions
├── scripts/         # Utility scripts (scraping, deployment)
├── services/        # Business logic services
├── utils/           # Utility functions
└── index.js         # Main application entry point
```

## Installation

```bash
npm install
```

## Configuration

Create a `.env` file:

```env
PORT=3000
MONGO_URI=mongodb://127.0.0.1:27017/pedal_prices_v2
SESSION_SECRET=your-secret-key-here
```

## Usage

### Development

```bash
npm start
```

### Production

The application uses PM2 for process management. See `ecosystem.config.js` for configuration.

## Scripts

### Node.js Scripts
- `scripts/scrape-monthly.js` - Monthly price scraping
- `scripts/scrape-specific-product.js` - Scrape specific product
- `scripts/deploy.sh` - Deployment script
- `scripts/run-monthly-scrape.sh` - Run monthly scrape script
- `scripts/setup-cron.sh` - Setup cron job for automated scraping

### Python Scripts
- `scripts/compare-pricing-tool.py` - Compare pricing data between spreadsheets and MongoDB
- `scripts/clean-pedal-pricing.py` - Clean and process pedal pricing data from Excel files

## License

ISC
