#!/bin/bash
# Setup script for monthly cron job
# This script configures a cron job to run scrape-monthly.js via PM2 once per month

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Cron job configuration
# Run on the 1st day of each month at 2:00 AM
# Format: minute hour day month weekday command
CRON_SCHEDULE="0 2 1 * *"

# PM2 command to restart the monthly-scrape process
# This will trigger the scrape script to run
CRON_JOB="$CRON_SCHEDULE cd $PROJECT_ROOT && /usr/bin/pm2 restart monthly-scrape || /usr/local/bin/pm2 restart monthly-scrape || pm2 restart monthly-scrape"

# Check if cron job already exists (check for any monthly-scrape reference)
if crontab -l 2>/dev/null | grep -q "monthly-scrape"; then
    echo "⚠️  Cron job already exists. Removing old entry..."
    crontab -l 2>/dev/null | grep -v "monthly-scrape" | crontab -
fi

# Also remove old wrapper script reference if it exists
if crontab -l 2>/dev/null | grep -q "run-monthly-scrape.sh"; then
    echo "⚠️  Removing old wrapper script cron job..."
    crontab -l 2>/dev/null | grep -v "run-monthly-scrape.sh" | crontab -
fi

# Add new cron job
(crontab -l 2>/dev/null; echo "$CRON_JOB") | crontab -

echo "✅ Cron job configured successfully!"
echo ""
echo "Schedule: $CRON_SCHEDULE (1st of each month at 2:00 AM)"
echo "PM2 Process: monthly-scrape"
echo ""
echo "Current crontab:"
crontab -l
echo ""
echo "To verify the cron job is set up correctly, run:"
echo "  crontab -l"
echo ""
echo "To test manually, run:"
echo "  pm2 restart monthly-scrape"
echo ""
echo "Note: Make sure PM2 process 'monthly-scrape' exists:"
echo "  pm2 list"
