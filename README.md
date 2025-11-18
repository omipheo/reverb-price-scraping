# Price Scraping Application

A Node.js application for scraping and managing guitar pedal prices from Reverb.com.

## Features

- Scrapes guitar pedal listings from Reverb.com
- Stores data in MongoDB
- Web dashboard for searching and managing pedals
- Price guide integration
- AI-powered brand filtering

## Tech Stack

- Node.js
- Express.js
- MongoDB
- Puppeteer
- Axios

## Getting Started

### Prerequisites

- Node.js 18+
- MongoDB
- npm

### Installation

1. Clone the repository:
```bash
git clone <your-repo-url>
cd price-scraping
```

2. Install dependencies:
```bash
npm install
```

3. Create `.env` file:
```env
OPENAI_API_KEY=your_key_here
PORT=80
NODE_ENV=development
MONGO_URI=mongodb://127.0.0.1:27017/prices
```

4. Start MongoDB:
```bash
# On Ubuntu/Debian
sudo systemctl start mongod

# On macOS
brew services start mongodb-community
```

5. Run the application:
```bash
# Development
npm run dev

# Production
npm start
```

## Deployment

### IONOS Server Deployment (Recommended)

**Quick Start:** See [IONOS_QUICK_START.md](./IONOS_QUICK_START.md) for 5-step setup.

**Complete Guide:** See [IONOS_DEPLOYMENT.md](./IONOS_DEPLOYMENT.md) for detailed instructions.

**How it works:**
```
Push to GitHub → GitHub Actions → Build & Test → Deploy to IONOS via SSH → Restart App
```

### CI/CD Pipeline Setup

1. **IONOS Server Setup:**
   ```bash
   # SSH into IONOS server
   ssh root@your-ionos-ip
   
   # Install Node.js, Git, PM2
   curl -fsSL https://deb.nodesource.com/setup_18.x | bash -
   apt-get install -y nodejs git
   npm install -g pm2
   
   # Generate SSH key for GitHub Actions
   ssh-keygen -t ed25519 -C "github-actions" -f ~/.ssh/github_actions -N ""
   cat ~/.ssh/github_actions.pub >> ~/.ssh/authorized_keys
   cat ~/.ssh/github_actions  # Copy this for GitHub Secrets
   ```

2. **Configure GitHub Secrets:**
   - Go to: Repository → Settings → Secrets → Actions
   - Add: `SERVER_HOST`, `SERVER_USER`, `SSH_PRIVATE_KEY`, `SSH_PORT`, `DEPLOY_PATH`

3. **Deploy:**
   ```bash
   git push origin main
   # GitHub Actions automatically deploys! 🚀
   ```

### Manual Deployment

```bash
# On server
cd /var/www/price-scraping
git pull origin main
npm ci --production
pm2 restart price-scraping
```

## PM2 Management

```bash
# Start
npm run pm2:start

# Stop
npm run pm2:stop

# Restart
npm run pm2:restart

# View logs
npm run pm2:logs
```

## Project Structure

```
price-scraping/
├── .github/
│   └── workflows/
│       └── deploy.yml          # CI/CD pipeline configuration
├── .vscode/
│   └── launch.json             # VS Code debugging config
├── models/
│   └── pedals.mdl.js          # MongoDB schema/model
├── public/
│   └── dashboard.html         # Frontend web dashboard
├── scripts/
│   ├── deploy.sh              # Manual deployment script
│   └── setup-server.sh        # Initial server setup
├── logs/                      # Application logs (gitignored)
├── index.js                   # Main application entry point
├── ecosystem.config.js        # PM2 process manager config
└── package.json               # Dependencies and scripts
```

## Environment Variables

- `OPENAI_API_KEY`: OpenAI API key for brand filtering
- `PORT`: Server port (default: 80)
- `NODE_ENV`: Environment (development/production)
- `MONGO_URI`: MongoDB connection string

## Documentation

- **[IONOS_QUICK_START.md](./IONOS_QUICK_START.md)** - Quick 5-step IONOS setup
- **[IONOS_DEPLOYMENT.md](./IONOS_DEPLOYMENT.md)** - Complete IONOS deployment guide
- **[DEBUGGING.md](./DEBUGGING.md)** - Debugging guide (if exists)

## License

ISC
