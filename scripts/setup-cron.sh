#!/bin/bash
# Setup script for monthly cron job
# This script configures a cron job to run scrape-monthly.js once per month

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
WRAPPER_SCRIPT="$SCRIPT_DIR/run-monthly-scrape.sh"

# Make wrapper script executable
chmod +x "$WRAPPER_SCRIPT"

# Cron job configuration
# Run on the 1st day of each month at 2:00 AM
# Format: minute hour day month weekday command
CRON_SCHEDULE="0 2 1 * *"

# Create cron job entry
CRON_JOB="$CRON_SCHEDULE $WRAPPER_SCRIPT"

# Check if cron job already exists
if crontab -l 2>/dev/null | grep -q "$WRAPPER_SCRIPT"; then
    echo "⚠️  Cron job already exists. Removing old entry..."
    crontab -l 2>/dev/null | grep -v "$WRAPPER_SCRIPT" | crontab -
fi

# Add new cron job
(crontab -l 2>/dev/null; echo "$CRON_JOB") | crontab -

echo "✅ Cron job configured successfully!"
echo ""
echo "Schedule: $CRON_SCHEDULE (1st of each month at 2:00 AM)"
echo "Script: $WRAPPER_SCRIPT"
echo ""
echo "Current crontab:"
crontab -l
echo ""
echo "To verify the cron job is set up correctly, run:"
echo "  crontab -l"
echo ""
echo "To test the script manually, run:"
echo "  $WRAPPER_SCRIPT"
