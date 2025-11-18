#!/bin/bash

# Deployment script for Ubuntu server
# This script can be run manually on the server or called from CI/CD

set -e  # Exit on error

echo "🚀 Starting deployment..."

# Configuration
DEPLOY_PATH="${DEPLOY_PATH:-/root/reverb-price-scraping}"
BRANCH="${BRANCH:-main}"

# Navigate to deployment directory
cd "$DEPLOY_PATH"

echo "📦 Pulling latest code from $BRANCH branch..."
git fetch origin
git reset --hard "origin/$BRANCH"

echo "📥 Installing dependencies..."
npm ci --production

echo "🔄 Restarting application..."
# Restart with PM2, or start if not running
# pm2 restart price-scraping || pm2 start ecosystem.config.js --name price-scraping

# echo "💾 Saving PM2 process list..."
# pm2 save

# echo "📊 Application status:"
# pm2 status

echo "✅ Deployment completed successfully!"

