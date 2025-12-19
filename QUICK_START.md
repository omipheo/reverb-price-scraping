# Quick Start Guide - Manual Deployment

## 🚀 Fastest Way to Deploy

Run this single command on your IONOS server:

```bash
cd /root/reverb-price-scraping && chmod +x scripts/deploy.sh && sudo bash scripts/deploy.sh
```

This will:
- ✅ Install dependencies
- ✅ Set up environment variables
- ✅ Start MongoDB (if needed)
- ✅ Start the application with PM2
- ✅ Configure monthly cron job

## 📋 Prerequisites Check

Before deploying, make sure you have:

```bash
# Check Node.js (need 18+)
node --version

# Check npm
npm --version

# Check MongoDB
mongod --version

# Install PM2 if not installed
npm install -g pm2
```

## 🔧 Manual Setup (if needed)

### 1. Install Dependencies
```bash
npm ci --production
```

### 2. Create .env file
```bash
nano .env
```

Add:
```env
MONGO_URI=mongodb://127.0.0.1:27017/pedal_prices_v2
PORT=3000
NODE_ENV=production
```

### 3. Start MongoDB
```bash
sudo systemctl start mongod
sudo systemctl enable mongod
```

### 4. Start Application
```bash
pm2 start ecosystem.config.js
pm2 save
pm2 startup
```

### 5. Setup Cron Job
```bash
chmod +x scripts/setup-cron.sh
bash scripts/setup-cron.sh
```

## ✅ Verify Everything Works

```bash
# Check app is running
pm2 status

# Check cron job
crontab -l

# Test monthly scrape
bash scripts/run-monthly-scrape.sh
```

## 📚 More Information

- **Full deployment guide**: See `MANUAL_DEPLOYMENT.md`
- **Cron job details**: See `CRON_SETUP.md`
- **Troubleshooting**: See `MANUAL_DEPLOYMENT.md` troubleshooting section

## 🆘 Quick Troubleshooting

**App won't start?**
```bash
pm2 logs price-scraping
# Check MongoDB: sudo systemctl status mongod
# Check .env: cat .env
```

**Cron not working?**
```bash
# Test manually
bash scripts/run-monthly-scrape.sh

# Check cron logs
grep CRON /var/log/syslog | tail -20
```
