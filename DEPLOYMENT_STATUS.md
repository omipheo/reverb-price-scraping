# Deployment Status

## ✅ Current Status

### Application
- **Status**: ✅ Running
- **Process Manager**: PM2
- **Process Name**: `price-scraping`
- **Port**: 80
- **MongoDB**: ✅ Connected

### Cron Job
- **Status**: ✅ Configured
- **Schedule**: `0 2 1 * *` (1st of each month at 2:00 AM)
- **Script**: `/root/reverb-price-scraping/scripts/run-monthly-scrape.sh`

## 🔧 Next Steps

### 1. Fix Session Warning (Optional but Recommended)

The application is showing a warning about MemoryStore. To fix it:

```bash
cd /root/reverb-price-scraping
npm install connect-mongo
pm2 restart price-scraping
```

The code has already been updated to use MongoDB session store, you just need to install the dependency.

### 2. Verify Everything Works

```bash
# Check application status
pm2 status

# Check logs
pm2 logs price-scraping --lines 50

# Test the monthly scrape script
bash scripts/run-monthly-scrape.sh
```

### 3. Monitor Logs

```bash
# Application logs
pm2 logs price-scraping

# Monthly scrape logs
ls -lh logs/scrape-monthly-*.log
tail -f logs/scrape-monthly-*.log
```

## 📊 Useful Commands

```bash
# PM2 Management
pm2 status                    # Show all processes
pm2 logs price-scraping        # View application logs
pm2 restart price-scraping     # Restart application
pm2 stop price-scraping        # Stop application
pm2 delete price-scraping      # Remove from PM2

# Cron Job
crontab -l                    # View cron jobs
crontab -e                    # Edit cron jobs

# MongoDB
sudo systemctl status mongod   # Check MongoDB status
sudo systemctl start mongod    # Start MongoDB
sudo systemctl stop mongod     # Stop MongoDB

# Logs
tail -f logs/pm2-out.log       # Application output
tail -f logs/pm2-error.log    # Application errors
tail -f logs/scrape-monthly-*.log  # Scrape logs
```

## 🎯 Monthly Scrape Schedule

The monthly scrape will run automatically:
- **When**: 1st day of each month at 2:00 AM
- **Script**: `scripts/run-monthly-scrape.sh`
- **Logs**: `logs/scrape-monthly-YYYYMMDD-HHMMSS.log`

To test it manually:
```bash
bash scripts/run-monthly-scrape.sh
```

## 🔍 Troubleshooting

### Application not running?
```bash
pm2 status
pm2 logs price-scraping --err --lines 50
```

### MongoDB connection issues?
```bash
sudo systemctl status mongod
mongosh "mongodb://127.0.0.1:27017/pedal_prices_v2"
```

### Cron job not working?
```bash
# Check if cron service is running
sudo systemctl status cron

# Check cron logs
grep CRON /var/log/syslog | tail -20

# Test script manually
bash scripts/run-monthly-scrape.sh
```
