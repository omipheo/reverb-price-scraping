# Manual Deployment Guide

This guide explains how to manually deploy the Reverb Price Scraping project to your IONOS server.

## Prerequisites

Before deploying, ensure you have:

1. **Node.js and npm** installed (Node.js 18+ recommended)
   ```bash
   node --version
   npm --version
   ```

2. **MongoDB** installed and running
   ```bash
   sudo systemctl status mongod
   ```

3. **PM2** (optional but recommended) for process management
   ```bash
   npm install -g pm2
   ```

4. **Git** (if deploying from repository)
   ```bash
   git --version
   ```

## Quick Deployment

The easiest way to deploy is using the automated deployment script:

```bash
cd /root/reverb-price-scraping
chmod +x scripts/deploy.sh
sudo bash scripts/deploy.sh
```

This script will:
- Install/update dependencies
- Create necessary directories
- Set up .env file (if missing)
- Start MongoDB (if needed)
- Start the application with PM2
- Configure the monthly cron job

## Manual Step-by-Step Deployment

If you prefer to deploy manually, follow these steps:

### 1. Navigate to Project Directory

```bash
cd /root/reverb-price-scraping
```

### 2. Install Dependencies

```bash
npm ci --production
```

### 3. Create Logs Directory

```bash
mkdir -p logs
```

### 4. Configure Environment Variables

Create or edit the `.env` file:

```bash
nano .env
```

Required variables:
```env
MONGO_URI=mongodb://127.0.0.1:27017/pedal_prices_v2
PORT=3000
NODE_ENV=production
```

Optional variables:
```env
OPENAI_API_KEY=your_key_here
SESSION_SECRET=your_secret_here
```

Set secure permissions:
```bash
chmod 600 .env
```

### 5. Start MongoDB

```bash
sudo systemctl start mongod
sudo systemctl enable mongod  # Enable on boot
```

### 6. Start the Application

**Option A: Using PM2 (Recommended)**

```bash
# If ecosystem.config.js exists
pm2 start ecosystem.config.js

# Or using Procfile
pm2 start npm --name "price-scraping" -- start

# Or directly
pm2 start index.js --name "price-scraping"

# Save PM2 configuration
pm2 save

# Enable PM2 on system startup
pm2 startup
```

**Option B: Using systemd**

Create a systemd service file `/etc/systemd/system/reverb-scraping.service`:

```ini
[Unit]
Description=Reverb Price Scraping Application
After=network.target mongod.service

[Service]
Type=simple
User=root
WorkingDirectory=/root/reverb-price-scraping
Environment=NODE_ENV=production
ExecStart=/usr/bin/node /root/reverb-price-scraping/index.js
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

Then:
```bash
sudo systemctl daemon-reload
sudo systemctl enable reverb-scraping
sudo systemctl start reverb-scraping
```

**Option C: Run Directly**

```bash
node index.js
```

### 7. Setup Monthly Cron Job

```bash
chmod +x scripts/setup-cron.sh
chmod +x scripts/run-monthly-scrape.sh
bash scripts/setup-cron.sh
```

Verify the cron job:
```bash
crontab -l
```

You should see:
```
0 2 1 * * /root/reverb-price-scraping/scripts/run-monthly-scrape.sh
```

## Verifying Deployment

### Check Application Status

**With PM2:**
```bash
pm2 status
pm2 logs price-scraping
```

**With systemd:**
```bash
sudo systemctl status reverb-scraping
sudo journalctl -u reverb-scraping -f
```

**Check if port is listening:**
```bash
sudo lsof -i :3000
# or
sudo netstat -tlnp | grep :3000
```

### Test the Application

```bash
curl http://localhost:3000
```

### Test Monthly Scrape Script

```bash
bash scripts/run-monthly-scrape.sh
```

Check logs:
```bash
ls -lh logs/
tail -f logs/scrape-monthly-*.log
```

## Updating the Application

### If using Git:

```bash
cd /root/reverb-price-scraping
git pull origin main
npm ci --production
pm2 restart price-scraping
# or
sudo systemctl restart reverb-scraping
```

### If updating manually:

```bash
cd /root/reverb-price-scraping
# Copy new files
npm ci --production
pm2 restart price-scraping
```

## Troubleshooting

### Application won't start

1. **Check MongoDB is running:**
   ```bash
   sudo systemctl status mongod
   sudo systemctl start mongod
   ```

2. **Check .env file:**
   ```bash
   cat .env
   # Ensure MONGO_URI is correct
   ```

3. **Check port availability:**
   ```bash
   sudo lsof -i :3000
   ```

4. **Check logs:**
   ```bash
   pm2 logs price-scraping
   # or
   sudo journalctl -u reverb-scraping -n 50
   ```

### Cron job not running

1. **Check cron service:**
   ```bash
   sudo systemctl status cron
   ```

2. **Check cron logs:**
   ```bash
   grep CRON /var/log/syslog | tail -20
   ```

3. **Verify cron job exists:**
   ```bash
   crontab -l
   ```

4. **Test script manually:**
   ```bash
   bash scripts/run-monthly-scrape.sh
   ```

### MongoDB connection issues

1. **Test MongoDB connection:**
   ```bash
   mongosh "mongodb://127.0.0.1:27017/pedal_prices_v2"
   ```

2. **Check MongoDB logs:**
   ```bash
   sudo journalctl -u mongod -n 50
   ```

3. **Verify MONGO_URI in .env:**
   ```bash
   grep MONGO_URI .env
   ```

## Useful Commands

```bash
# PM2 Commands
pm2 status                    # Show status
pm2 logs price-scraping       # View logs
pm2 restart price-scraping    # Restart app
pm2 stop price-scraping       # Stop app
pm2 delete price-scraping     # Remove from PM2

# MongoDB Commands
sudo systemctl start mongod   # Start MongoDB
sudo systemctl stop mongod    # Stop MongoDB
sudo systemctl status mongod  # Check status

# Cron Commands
crontab -l                    # List cron jobs
crontab -e                    # Edit cron jobs

# Logs
tail -f logs/scrape-monthly-*.log  # View scrape logs
pm2 logs price-scraping --lines 100  # View app logs
```

## Security Considerations

1. **.env file permissions:**
   ```bash
   chmod 600 .env
   ```

2. **Firewall configuration:**
   ```bash
   # Only allow necessary ports
   sudo ufw allow 22/tcp   # SSH
   sudo ufw allow 80/tcp   # HTTP (if using port 80)
   sudo ufw allow 443/tcp  # HTTPS (if using SSL)
   ```

3. **Regular updates:**
   ```bash
   npm audit
   npm audit fix
   ```

## Next Steps

After successful deployment:

1. ✅ Verify the application is accessible
2. ✅ Test the monthly scrape script manually
3. ✅ Verify cron job is scheduled
4. ✅ Set up monitoring (optional)
5. ✅ Configure backups for MongoDB (recommended)
