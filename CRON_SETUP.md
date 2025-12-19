# Monthly Scraping Cron Job Setup

This document explains how the monthly scraping cron job is configured for the Reverb price scraping project.

## Overview

The `scripts/scrape-monthly.js` script is configured to run automatically once per month using a cron job. The job runs on the 1st day of each month at 2:00 AM.

## Setup Methods

### Automatic Setup (via deployment script)

If you use the deployment script (`scripts/deploy.sh`), the cron job is automatically configured.

### Manual Setup

If you need to set up the cron job manually on the server:

```bash
cd /root/reverb-price-scraping
chmod +x scripts/setup-cron.sh
bash scripts/setup-cron.sh
```

## Cron Schedule

- **Schedule**: `0 2 1 * *` (1st day of each month at 2:00 AM)
- **Script**: `scripts/run-monthly-scrape.sh`

## Scripts

### `scripts/run-monthly-scrape.sh`
Wrapper script that:
- Loads environment variables from `.env`
- Sets up logging to `logs/` directory
- Runs `scrape-monthly.js` with proper error handling
- Logs output with timestamps
- Cleans up old logs (keeps last 12 months)

### `scripts/setup-cron.sh`
Setup script that:
- Makes the wrapper script executable
- Adds/updates the cron job entry
- Verifies the cron job is installed

## Logs

Logs are stored in the `logs/` directory:
- **Individual run logs**: `logs/scrape-monthly-YYYYMMDD-HHMMSS.log`
- **Error log**: `logs/scrape-monthly-errors.log`

## Verifying the Cron Job

To check if the cron job is set up:

```bash
crontab -l
```

You should see an entry like:
```
0 2 1 * * /root/reverb-price-scraping/scripts/run-monthly-scrape.sh
```

## Testing the Script Manually

To test the scraping script manually:

```bash
cd /root/reverb-price-scraping
bash scripts/run-monthly-scrape.sh
```

Or run the Node.js script directly:

```bash
cd /root/reverb-price-scraping
node scripts/scrape-monthly.js
```

## Troubleshooting

### Cron job not running
1. Check if cron service is running: `systemctl status cron` or `service cron status`
2. Check cron logs: `grep CRON /var/log/syslog` (Ubuntu/Debian)
3. Verify the script is executable: `ls -l scripts/run-monthly-scrape.sh`
4. Check environment variables are set in `.env`

### Script fails with MongoDB connection error
- Ensure MongoDB is running: `systemctl status mongod`
- Verify `MONGO_URI` is set correctly in `.env`
- Check MongoDB connection: `mongosh "$MONGO_URI"`

### No logs generated
- Check if `logs/` directory exists and is writable
- Verify the script has execute permissions
- Check disk space: `df -h`

## Modifying the Schedule

To change when the cron job runs, edit `scripts/setup-cron.sh` and modify the `CRON_SCHEDULE` variable:

```bash
# Examples:
# Run on 1st of month at 3:00 AM
CRON_SCHEDULE="0 3 1 * *"

# Run on 15th of month at midnight
CRON_SCHEDULE="0 0 15 * *"

# Run on 1st of month at 1:00 AM
CRON_SCHEDULE="0 1 1 * *"
```

After modifying, run the setup script again:
```bash
bash scripts/setup-cron.sh
```

## Removing the Cron Job

To remove the cron job:

```bash
crontab -l | grep -v "run-monthly-scrape.sh" | crontab -
```

Or edit crontab directly:
```bash
crontab -e
```

Then remove the line containing `run-monthly-scrape.sh`.
