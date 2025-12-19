#!/bin/bash
# Wrapper script for monthly scraping job
# This ensures proper environment setup and logging

# Get the directory where this script is located
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Change to project root directory
cd "$PROJECT_ROOT" || exit 1

# Load environment variables from .env file if it exists
if [ -f .env ]; then
    export $(cat .env | grep -v '^#' | xargs)
fi

# Set up logging
LOG_DIR="$PROJECT_ROOT/logs"
mkdir -p "$LOG_DIR"
LOG_FILE="$LOG_DIR/scrape-monthly-$(date +%Y%m%d-%H%M%S).log"
ERROR_LOG="$LOG_DIR/scrape-monthly-errors.log"

# Function to log messages
log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

log "========================================="
log "Starting monthly scrape job"
log "========================================="
log "Project root: $PROJECT_ROOT"
log "Node version: $(node --version)"
log "NPM version: $(npm --version)"

# Check if MongoDB URI is set
if [ -z "$MONGO_URI" ]; then
    log "ERROR: MONGO_URI is not set in environment"
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] ERROR: MONGO_URI is not set" >> "$ERROR_LOG"
    exit 1
fi

log "MONGO_URI is configured"

# Run the scraping script
log "Executing scrape-monthly.js..."
node "$SCRIPT_DIR/scrape-monthly.js" >> "$LOG_FILE" 2>&1
EXIT_CODE=$?

if [ $EXIT_CODE -eq 0 ]; then
    log "========================================="
    log "Monthly scrape completed successfully"
    log "========================================="
else
    log "========================================="
    log "Monthly scrape FAILED with exit code: $EXIT_CODE"
    log "========================================="
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] Monthly scrape failed with exit code: $EXIT_CODE" >> "$ERROR_LOG"
    # Show last 50 lines of log for debugging
    log "Last 50 lines of output:"
    tail -n 50 "$LOG_FILE" | while IFS= read -r line; do
        log "$line"
    done
fi

# Clean up old logs (keep last 12 months)
find "$LOG_DIR" -name "scrape-monthly-*.log" -type f -mtime +365 -delete 2>/dev/null

exit $EXIT_CODE
