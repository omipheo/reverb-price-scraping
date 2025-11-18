# Debugging PM2 Errors

## Quick Check Commands

Run these commands on your server to diagnose the issue:

```bash
# 1. Check error logs
pm2 logs price-scraping --err --lines 50

# 2. Check all logs
pm2 logs price-scraping --lines 50

# 3. Get detailed process info
pm2 describe price-scraping

# 4. Check if MongoDB is running
systemctl status mongod

# 5. Check if port 80 is in use
sudo lsof -i :80

# 6. Check if .env file exists and has correct values
cd /root/reverb-price-scraping
cat .env

# 7. Test MongoDB connection
mongosh mongodb://127.0.0.1:27017/prices
```

## Common Issues and Fixes

### Issue 1: MongoDB Not Running
**Symptoms:** Connection timeout errors in logs

**Fix:**
```bash
# Start MongoDB
systemctl start mongod

# Enable MongoDB to start on boot
systemctl enable mongod

# Check status
systemctl status mongod
```

### Issue 2: Port 80 Already in Use
**Symptoms:** "EADDRINUSE" error in logs

**Fix:**
```bash
# Find what's using port 80
sudo lsof -i :80

# Kill the process or change PORT in .env
# Option 1: Change PORT in .env to 3000
nano .env
# Change: PORT=3000

# Option 2: Stop the service using port 80
sudo systemctl stop apache2  # if Apache
sudo systemctl stop nginx    # if Nginx
```

### Issue 3: Missing Dependencies
**Symptoms:** "Cannot find module" errors

**Fix:**
```bash
cd /root/reverb-price-scraping
npm ci --production
```

### Issue 4: Missing or Invalid .env File
**Symptoms:** "OPENAI_API_KEY is not set" or similar

**Fix:**
```bash
cd /root/reverb-price-scraping

# Check if .env exists
ls -la .env

# If missing, create it
nano .env
# Add:
# OPENAI_API_KEY=sk-your-key-here
# PORT=80
# NODE_ENV=production
# MONGO_URI=mongodb://127.0.0.1:27017/prices

# Set permissions
chmod 600 .env
```

### Issue 5: Permission Issues
**Symptoms:** "EACCES" or permission denied errors

**Fix:**
```bash
# Make sure you own the directory
sudo chown -R root:root /root/reverb-price-scraping

# Check file permissions
ls -la
```

## Restart Process After Fix

After fixing any issue:

```bash
# Delete the errored process
pm2 delete price-scraping

# Start fresh
pm2 start ecosystem.config.js

# Save PM2 configuration
pm2 save

# Check status
pm2 status
pm2 logs price-scraping --lines 20
```

