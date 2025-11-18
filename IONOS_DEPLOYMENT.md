# IONOS Server CI/CD Deployment Guide

Complete guide for deploying to IONOS server using GitHub Actions CI/CD pipeline.

## 📋 Table of Contents

1. [IONOS Server Overview](#ionos-server-overview)
2. [Prerequisites](#prerequisites)
3. [IONOS Server Setup](#ionos-server-setup)
4. [GitHub Configuration](#github-configuration)
5. [Deployment Process](#deployment-process)
6. [IONOS-Specific Considerations](#ionos-specific-considerations)
7. [Troubleshooting](#troubleshooting)

---

## 🖥️ IONOS Server Overview

IONOS provides VPS (Virtual Private Server) hosting. This guide assumes you have:
- IONOS VPS with Ubuntu/Linux
- SSH access to your server
- Root or sudo access

---

## ✅ Prerequisites

### Required

- GitHub account with repository
- IONOS VPS/server with SSH access
- Domain name (optional, for custom domain)
- Basic knowledge of Linux commands

### IONOS Account Setup

1. Log in to IONOS Control Panel
2. Navigate to **Server & Cloud** → **VPS**
3. Note your server IP address
4. Ensure SSH access is enabled

---

## 🚀 IONOS Server Setup

### Step 1: Connect to IONOS Server

```bash
# Connect via SSH (IONOS typically uses root or a custom user)
ssh root@your-ionos-server-ip
# Or
ssh username@your-ionos-server-ip

# If using password authentication, you'll be prompted
# IONOS may provide initial credentials in their control panel
```

### Step 2: Update System

```bash
# Update package list
apt-get update
apt-get upgrade -y
```

### Step 3: Install Required Software

```bash
# Install Node.js 18.x
curl -fsSL https://deb.nodesource.com/setup_18.x | bash -
apt-get install -y nodejs

# Install Git
apt-get install -y git

# Install PM2 (Process Manager)
npm install -g pm2

# Install MongoDB (if not already installed)
# Follow MongoDB installation guide for your Ubuntu version
# https://www.mongodb.com/docs/manual/installation/
```

### Step 4: Create Deployment User (Recommended)

```bash
# Create a dedicated deployment user (more secure than root)
adduser deploy
usermod -aG sudo deploy

# Switch to deploy user
su - deploy

# Create deployment directory
sudo mkdir -p /var/www/price-scraping
sudo chown deploy:deploy /var/www/price-scraping
```

### Step 5: Set Up SSH Key for GitHub Actions

```bash
# As deploy user (or root if using root)
ssh-keygen -t ed25519 -C "github-actions-ionos" -f ~/.ssh/github_actions -N ""

# Add public key to authorized_keys
cat ~/.ssh/github_actions.pub >> ~/.ssh/authorized_keys
chmod 600 ~/.ssh/authorized_keys

# Display private key (you'll need this for GitHub Secrets)
echo "=== Copy this private key for GitHub Secrets ==="
cat ~/.ssh/github_actions
echo "=== End of private key ==="
```

### Step 6: Clone Repository

```bash
cd /var/www/price-scraping
git clone https://github.com/your-username/your-repo.git .
```

### Step 7: Configure Environment Variables

```bash
nano .env
```

Add your environment variables:
```env
OPENAI_API_KEY=your_openai_api_key_here
PORT=80
NODE_ENV=production
MONGO_URI=mongodb://127.0.0.1:27017/prices
```

### Step 8: Install Dependencies and Start

```bash
# Install dependencies
npm ci --production

# Create logs directory
mkdir -p logs

# Start with PM2
pm2 start ecosystem.config.js

# Save PM2 configuration
pm2 save

# Setup PM2 to start on boot
pm2 startup
# Follow the instructions shown (usually involves running a sudo command)
```

### Step 9: Configure Firewall (IONOS)

IONOS may have a firewall in their control panel. Configure both:

**IONOS Control Panel:**
1. Go to **Server & Cloud** → **VPS** → Your Server
2. Navigate to **Firewall** settings
3. Allow ports:
   - **22** (SSH)
   - **80** (HTTP)
   - **443** (HTTPS)

**Ubuntu Firewall (ufw):**
```bash
# Allow SSH
ufw allow 22/tcp

# Allow HTTP/HTTPS
ufw allow 80/tcp
ufw allow 443/tcp

# Enable firewall
ufw enable

# Check status
ufw status
```

---

## 🔐 GitHub Configuration

### Step 1: Add GitHub Secrets

1. Go to your GitHub repository
2. Navigate to **Settings** → **Secrets and variables** → **Actions**
3. Click **New repository secret**
4. Add the following secrets:

#### Required Secrets for IONOS

| Secret Name | Description | Example |
|------------|-------------|---------|
| `SERVER_HOST` | IONOS server IP address | `123.45.67.89` |
| `SERVER_USER` | SSH username (usually `root` or `deploy`) | `deploy` |
| `SSH_PRIVATE_KEY` | SSH private key (from Step 5) | `-----BEGIN OPENSSH PRIVATE KEY-----...` |
| `SSH_PORT` | SSH port (usually 22) | `22` |
| `DEPLOY_PATH` | Deployment directory | `/var/www/price-scraping` |

### Step 2: Verify Workflow File

Ensure `.github/workflows/deploy.yml` exists and is configured correctly.

---

## 🚀 Deployment Process

### Automatic Deployment

1. **Push to main/master branch:**
   ```bash
   git add .
   git commit -m "Your changes"
   git push origin main
   ```

2. **Monitor deployment:**
   - Go to GitHub repository
   - Click **Actions** tab
   - Watch the workflow run in real-time

3. **Verify deployment:**
   ```bash
   # SSH into IONOS server
   ssh deploy@your-ionos-server-ip
   
   # Check PM2 status
   pm2 status
   
   # View logs
   pm2 logs price-scraping --lines 50
   ```

### Manual Deployment Trigger

1. Go to **Actions** tab in GitHub
2. Select **Deploy to Ubuntu Server** workflow
3. Click **Run workflow**
4. Select branch and click **Run workflow**

---

## 🌐 IONOS-Specific Considerations

### 1. IONOS Control Panel Access

- **Server Management:** Access via IONOS Control Panel
- **Firewall Rules:** Configure in IONOS panel, not just on server
- **Backups:** IONOS may provide backup options - enable them
- **Monitoring:** Use IONOS monitoring tools + PM2 monitoring

### 2. Domain Configuration (If Using Custom Domain)

If you have a domain through IONOS:

1. **DNS Configuration:**
   - Go to IONOS Control Panel → **Domains & SSL**
   - Add A record pointing to your server IP
   - Example: `@` → `123.45.67.89`

2. **SSL Certificate (Optional):**
   ```bash
   # Install Certbot for Let's Encrypt
   apt-get install -y certbot python3-certbot-nginx
   
   # If using Nginx, get certificate
   certbot --nginx -d yourdomain.com
   ```

### 3. IONOS Network Configuration

- **Static IP:** IONOS VPS usually has static IP (good for CI/CD)
- **Port Forwarding:** Usually not needed for VPS
- **Bandwidth:** Monitor usage in IONOS panel

### 4. Resource Monitoring

```bash
# Monitor server resources
htop  # or top

# Monitor PM2
pm2 monit

# Check disk space
df -h

# Check memory
free -h
```

### 5. IONOS Backup Strategy

```bash
# Create backup script
nano /root/backup.sh
```

```bash
#!/bin/bash
# Backup MongoDB
mongodump --out /backup/mongodb-$(date +%Y%m%d)

# Backup application
tar -czf /backup/app-$(date +%Y%m%d).tar.gz /var/www/price-scraping

# Keep only last 7 days
find /backup -name "*.tar.gz" -mtime +7 -delete
find /backup -name "mongodb-*" -mtime +7 -exec rm -rf {} \;
```

```bash
chmod +x /root/backup.sh

# Add to crontab (daily at 2 AM)
crontab -e
# Add: 0 2 * * * /root/backup.sh
```

---

## 🔍 Troubleshooting

### Connection Issues

**Problem:** Cannot SSH into IONOS server

**Solutions:**
1. Check IONOS Control Panel → Firewall settings
2. Verify SSH service is running: `systemctl status ssh`
3. Check if port 22 is open: `netstat -tulpn | grep :22`
4. Verify IP address in IONOS panel

### Deployment Fails: Permission Denied

**Problem:** GitHub Actions cannot write to deployment directory

**Solutions:**
```bash
# Fix permissions
sudo chown -R deploy:deploy /var/www/price-scraping
sudo chmod -R 755 /var/www/price-scraping

# Ensure deploy user can run PM2
sudo chown -R deploy:deploy ~/.pm2
```

### Port 80 Already in Use

**Problem:** Another service is using port 80

**Solutions:**
```bash
# Check what's using port 80
sudo netstat -tulpn | grep :80

# If Apache is running, stop it
sudo systemctl stop apache2
sudo systemctl disable apache2

# Or change your app port in .env
PORT=3000
```

### MongoDB Connection Issues

**Problem:** Application cannot connect to MongoDB

**Solutions:**
```bash
# Check MongoDB status
sudo systemctl status mongod

# Start MongoDB
sudo systemctl start mongod

# Check MongoDB logs
sudo tail -f /var/log/mongodb/mongod.log

# Verify MongoDB is listening
sudo netstat -tulpn | grep :27017
```

### IONOS Firewall Blocking

**Problem:** Application not accessible from outside

**Solutions:**
1. **IONOS Control Panel:**
   - Go to Firewall settings
   - Add rule: Allow TCP port 80
   - Add rule: Allow TCP port 443

2. **Ubuntu Firewall:**
   ```bash
   sudo ufw allow 80/tcp
   sudo ufw allow 443/tcp
   sudo ufw reload
   ```

### PM2 Not Starting on Boot

**Problem:** Application doesn't start after server reboot

**Solutions:**
```bash
# Re-run PM2 startup
pm2 startup

# Follow the command shown (usually involves sudo)
# Example: sudo env PATH=$PATH:/usr/bin pm2 startup systemd -u deploy --hp /home/deploy

# Save current PM2 list
pm2 save

# Test by rebooting
sudo reboot
```

---

## 📊 Monitoring & Maintenance

### Check Application Status

```bash
# PM2 status
pm2 status

# PM2 logs
pm2 logs price-scraping

# PM2 monitoring
pm2 monit

# System resources
htop
```

### View IONOS Server Metrics

1. Log in to IONOS Control Panel
2. Go to **Server & Cloud** → **VPS** → Your Server
3. View:
   - CPU usage
   - Memory usage
   - Disk usage
   - Network traffic

### Regular Maintenance

```bash
# Update system packages (monthly)
sudo apt-get update && sudo apt-get upgrade -y

# Clean npm cache
npm cache clean --force

# Check disk space
df -h

# Check for large log files
du -sh /var/www/price-scraping/logs/*
```

---

## 🔒 Security Best Practices for IONOS

1. **Use SSH Keys:** Never use password authentication
2. **Disable Root Login:** Use a dedicated user account
3. **Keep Updated:** Regularly update system packages
4. **Firewall:** Configure both IONOS and Ubuntu firewalls
5. **Backups:** Set up automated backups
6. **Monitor Logs:** Regularly check application and system logs
7. **SSL/HTTPS:** Use SSL certificates for production
8. **Environment Variables:** Never commit `.env` file

---

## 📝 Quick Reference

### Essential Commands

```bash
# Connect to IONOS server
ssh deploy@your-ionos-server-ip

# Check application status
pm2 status

# View logs
pm2 logs price-scraping

# Restart application
pm2 restart price-scraping

# Check MongoDB
sudo systemctl status mongod

# Check firewall
sudo ufw status

# View system resources
htop
```

### IONOS Control Panel Locations

- **Server Management:** Server & Cloud → VPS
- **Firewall:** Server & Cloud → VPS → Firewall
- **Backups:** Server & Cloud → VPS → Backups
- **Monitoring:** Server & Cloud → VPS → Monitoring

---

## ✅ Deployment Checklist

Before first deployment:

- [ ] IONOS server is running and accessible
- [ ] SSH access is working
- [ ] Node.js, Git, PM2 installed
- [ ] MongoDB installed and running
- [ ] Deployment directory created
- [ ] Repository cloned
- [ ] `.env` file configured
- [ ] Application starts manually
- [ ] GitHub Secrets configured
- [ ] IONOS firewall allows ports 22, 80, 443
- [ ] Ubuntu firewall configured
- [ ] PM2 startup configured
- [ ] Test deployment works

---

## 🆘 Getting Help

### IONOS Support

- **Documentation:** https://www.ionos.com/help/
- **Support:** Contact IONOS support via control panel
- **Status:** Check IONOS status page for outages

### Application Issues

- Check GitHub Actions logs
- Check PM2 logs: `pm2 logs price-scraping`
- Check system logs: `journalctl -xe`
- Review troubleshooting section above

---

## 🎓 Additional Resources

- [IONOS VPS Documentation](https://www.ionos.com/help/)
- [GitHub Actions Documentation](https://docs.github.com/en/actions)
- [PM2 Documentation](https://pm2.keymetrics.io/docs/)
- [MongoDB Production Notes](https://www.mongodb.com/docs/manual/administration/production-notes/)

---

**Your IONOS server is now ready for automated CI/CD deployment!** 🚀

