#!/bin/bash
# Manual deployment script for Reverb Price Scraping project
# Run this script on your IONOS server to deploy the application

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Get the directory where this script is located
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Change to project root
cd "$PROJECT_ROOT" || exit 1

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}  Reverb Price Scraping - Deployment${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""

# Check if running as root (recommended for IONOS server)
if [ "$EUID" -ne 0 ]; then 
    echo -e "${YELLOW}⚠️  Warning: Not running as root. Some operations may require sudo.${NC}"
fi

# Step 1: Check Node.js and npm
echo -e "${GREEN}[1/7]${NC} Checking Node.js and npm..."
if ! command -v node &> /dev/null; then
    echo -e "${RED}❌ Node.js is not installed. Please install Node.js first.${NC}"
    exit 1
fi
if ! command -v npm &> /dev/null; then
    echo -e "${RED}❌ npm is not installed. Please install npm first.${NC}"
    exit 1
fi
echo "   Node.js version: $(node --version)"
echo "   npm version: $(npm --version)"
echo ""

# Step 2: Install/update dependencies
echo -e "${GREEN}[2/7]${NC} Installing dependencies..."
npm ci --production
echo ""

# Step 3: Create logs directory
echo -e "${GREEN}[3/7]${NC} Creating logs directory..."
mkdir -p logs
echo "   ✅ Logs directory created"
echo ""

# Step 4: Check .env file
echo -e "${GREEN}[4/7]${NC} Checking .env file..."
if [ ! -f .env ]; then
    echo -e "${YELLOW}⚠️  .env file not found. Creating from .env.example if available...${NC}"
    if [ -f .env.example ]; then
        cp .env.example .env
        echo "   ✅ Created .env from .env.example"
        echo -e "${YELLOW}   ⚠️  Please edit .env file and set your environment variables:${NC}"
        echo "      - MONGO_URI (required)"
        echo "      - PORT (optional, defaults to 3000)"
        echo "      - NODE_ENV (optional, defaults to production)"
        echo "      - OPENAI_API_KEY (optional)"
        echo "      - SESSION_SECRET (optional)"
    else
        echo -e "${YELLOW}   Creating basic .env file...${NC}"
        cat > .env << EOF
# MongoDB connection string
MONGO_URI=mongodb://127.0.0.1:27017/pedal_prices_v2

# Server port
PORT=3000

# Environment
NODE_ENV=production

# OpenAI API Key (optional)
# OPENAI_API_KEY=your_key_here

# Session secret (optional)
# SESSION_SECRET=your_secret_here
EOF
        chmod 600 .env
        echo "   ✅ Created basic .env file"
        echo -e "${YELLOW}   ⚠️  Please edit .env file and set your environment variables${NC}"
    fi
else
    echo "   ✅ .env file exists"
    chmod 600 .env
fi
echo ""

# Step 5: Check MongoDB
echo -e "${GREEN}[5/7]${NC} Checking MongoDB..."
if command -v mongod &> /dev/null || command -v mongosh &> /dev/null; then
    # Try to check if MongoDB is running
    if systemctl is-active --quiet mongod 2>/dev/null || pgrep -x mongod > /dev/null; then
        echo "   ✅ MongoDB is running"
    else
        echo -e "${YELLOW}   ⚠️  MongoDB is installed but not running${NC}"
        echo "   Attempting to start MongoDB..."
        if systemctl start mongod 2>/dev/null || service mongod start 2>/dev/null; then
            echo "   ✅ MongoDB started"
        else
            echo -e "${YELLOW}   ⚠️  Could not start MongoDB automatically${NC}"
            echo "   Please start MongoDB manually: sudo systemctl start mongod"
        fi
    fi
else
    echo -e "${YELLOW}   ⚠️  MongoDB not found. Please install MongoDB if you haven't already.${NC}"
fi
echo ""

# Step 6: Setup PM2 (if available)
echo -e "${GREEN}[6/7]${NC} Setting up PM2 process manager..."
if command -v pm2 &> /dev/null; then
    echo "   PM2 is installed"
    
    # Stop and delete existing process if it exists
    if pm2 list | grep -q "price-scraping"; then
        echo "   Stopping existing process..."
        pm2 stop price-scraping || true
        pm2 delete price-scraping || true
    fi
    
    # Check if ecosystem.config.js exists
    if [ -f ecosystem.config.js ]; then
        echo "   Starting application with ecosystem.config.js..."
        pm2 start ecosystem.config.js
    else
        # Create a basic PM2 config or use Procfile
        if [ -f Procfile ]; then
            echo "   Starting application with Procfile..."
            # Extract command from Procfile
            CMD=$(grep "^web:" Procfile | sed 's/^web: //')
            pm2 start "$CMD" --name "price-scraping"
        else
            echo "   Starting application with index.js..."
            pm2 start index.js --name "price-scraping"
        fi
    fi
    
    sleep 2
    
    # Save PM2 process list
    pm2 save
    
    # Show status
    echo ""
    echo "   📊 PM2 Status:"
    pm2 status
    
    # Check if process is errored
    if pm2 list | grep "price-scraping" | grep -q "errored"; then
        echo -e "${RED}   ❌ Process is errored. Showing logs:${NC}"
        pm2 logs price-scraping --err --lines 20 --nostream || true
        echo ""
        echo -e "${YELLOW}   💡 Common issues:${NC}"
        echo "      - MongoDB not running: sudo systemctl start mongod"
        echo "      - Missing .env file or MONGO_URI"
        echo "      - Port already in use (check with: sudo lsof -i :PORT)"
    else
        echo "   ✅ Application started successfully"
    fi
else
    echo -e "${YELLOW}   ⚠️  PM2 is not installed${NC}"
    echo "   Install PM2 with: npm install -g pm2"
    echo "   Or run the application manually with: node index.js"
fi
echo ""

# Step 7: Setup cron job
echo -e "${GREEN}[7/7]${NC} Setting up monthly cron job..."
if [ -f "$SCRIPT_DIR/setup-cron.sh" ]; then
    chmod +x "$SCRIPT_DIR/setup-cron.sh"
    chmod +x "$SCRIPT_DIR/run-monthly-scrape.sh"
    bash "$SCRIPT_DIR/setup-cron.sh"
    echo "   ✅ Cron job configured"
else
    echo -e "${YELLOW}   ⚠️  Cron setup script not found${NC}"
fi
echo ""

# Final summary
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}  Deployment Summary${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo "✅ Deployment completed!"
echo ""
echo "📋 Next steps:"
echo "   1. Verify .env file has correct values"
echo "   2. Check application is running:"
if command -v pm2 &> /dev/null; then
    echo "      pm2 status"
    echo "      pm2 logs price-scraping"
else
    echo "      Check if the application is running manually"
fi
echo "   3. Verify cron job:"
echo "      crontab -l"
echo ""
echo "📝 Useful commands:"
echo "   - View PM2 logs: pm2 logs price-scraping"
echo "   - Restart app: pm2 restart price-scraping"
echo "   - Test monthly scrape: bash scripts/run-monthly-scrape.sh"
echo "   - View cron logs: grep CRON /var/log/syslog"
echo ""
