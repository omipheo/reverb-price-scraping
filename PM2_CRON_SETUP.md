# PM2 + Cron Setup for Monthly Scraping

## Current Setup

✅ **PM2 Process**: `monthly-scrape` is configured  
✅ **Cron Job**: Will trigger PM2 to restart the process monthly  
✅ **Schedule**: 1st of each month at 2:00 AM

## How It Works

```
Cron (1st of month, 2:00 AM)
  └─> pm2 restart monthly-scrape
      └─> PM2 restarts the scrape-monthly.js script
          └─> Script runs, completes, PM2 keeps it stopped
```

## Important Configuration

The PM2 process should be configured with:
- **Auto-restart disabled** (or set to `false`) - so it doesn't keep restarting after completion
- The script will run once when triggered by cron, then stay stopped until next month

## Update PM2 Configuration

To ensure the process doesn't auto-restart after completion, you can:

### Option 1: Stop the process after it completes (Recommended)

The script should exit normally when done, and PM2 will keep it stopped.

### Option 2: Configure PM2 with no auto-restart

```bash
pm2 start scripts/scrape-monthly.js \
  --name monthly-scrape \
  --no-autorestart \
  --max-restarts 0
```

### Option 3: Use PM2 ecosystem config

Update `ecosystem.config.js` to include the monthly-scrape process:

```javascript
module.exports = {
  apps: [
    {
      name: "price-scraping",
      script: "index.js",
      // ... existing config
    },
    {
      name: "monthly-scrape",
      script: "scripts/scrape-monthly.js",
      instances: 1,
      exec_mode: "fork",
      autorestart: false,  // Don't auto-restart after completion
      max_restarts: 0,
      error_file: "./logs/pm2-monthly-scrape-error.log",
      out_file: "./logs/pm2-monthly-scrape-out.log",
    },
  ],
};
```

## Setup Steps

1. **Ensure PM2 process exists:**
   ```bash
   pm2 list
   # Should see "monthly-scrape"
   ```

2. **Update cron job:**
   ```bash
   bash scripts/setup-cron.sh
   ```

3. **Verify cron job:**
   ```bash
   crontab -l
   # Should see: 0 2 1 * * cd /root/reverb-price-scraping && pm2 restart monthly-scrape
   ```

4. **Test manually:**
   ```bash
   pm2 restart monthly-scrape
   pm2 logs monthly-scrape
   ```

## Monthly Execution Flow

1. **1st of month, 2:00 AM**: Cron triggers `pm2 restart monthly-scrape`
2. **PM2 starts**: The scrape-monthly.js script begins running
3. **Script executes**: Scrapes data from Reverb (takes 2-5 hours)
4. **Script completes**: Exits normally
5. **PM2 keeps it stopped**: Process stays stopped until next month's cron trigger

## Monitoring

```bash
# Check PM2 status
pm2 status

# View logs
pm2 logs monthly-scrape

# Monitor in real-time
pm2 monit

# Check if process is running
pm2 describe monthly-scrape
```

## Troubleshooting

### Process keeps restarting
```bash
# Stop auto-restart
pm2 stop monthly-scrape
pm2 delete monthly-scrape
pm2 start scripts/scrape-monthly.js --name monthly-scrape --no-autorestart
```

### Cron not triggering PM2
```bash
# Check cron logs
grep CRON /var/log/syslog | grep monthly-scrape

# Test cron command manually
cd /root/reverb-price-scraping && pm2 restart monthly-scrape
```

### PM2 not found in cron
```bash
# Find PM2 path
which pm2

# Update cron job with full path
# Edit crontab: crontab -e
# Use full path: /usr/local/bin/pm2 or /usr/bin/pm2
```
