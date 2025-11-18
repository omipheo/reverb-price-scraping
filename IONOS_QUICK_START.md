# IONOS Server - Quick Start Guide

Fast 5-step guide to deploy to IONOS server using CI/CD.

## 🚀 Quick Setup (5 Steps)

### Step 1: Connect to IONOS Server

```bash
# SSH into your IONOS server
ssh root@your-ionos-ip
# Or use the username provided by IONOS
```

### Step 2: Run Setup Script

```bash
# Install Node.js, Git, PM2
curl -fsSL https://deb.nodesource.com/setup_18.x | bash -
apt-get install -y nodejs git
npm install -g pm2

# Create deployment directory
mkdir -p /var/www/price-scraping
cd /var/www/price-scraping

# Generate SSH key for GitHub Actions
ssh-keygen -t ed25519 -C "github-actions" -f ~/.ssh/github_actions -N ""
cat ~/.ssh/github_actions.pub >> ~/.ssh/authorized_keys

# Display private key (COPY THIS!)
cat ~/.ssh/github_actions
```

### Step 3: Clone Repository

```bash
cd /var/www/price-scraping
git clone https://github.com/your-username/your-repo.git .
```

### Step 4: Configure GitHub Secrets

Go to: **GitHub Repository → Settings → Secrets → Actions**

Add these secrets:

| Secret | Value |
|--------|-------|
| `SERVER_HOST` | Your IONOS server IP |
| `SERVER_USER` | `root` (or your IONOS username) |
| `SSH_PRIVATE_KEY` | Private key from Step 2 |
| `SSH_PORT` | `22` |
| `DEPLOY_PATH` | `/var/www/price-scraping` |

### Step 5: Configure Environment & Deploy

```bash
# Create .env file
nano .env
# Add: OPENAI_API_KEY, PORT, MONGO_URI, NODE_ENV

# Install dependencies
npm ci --production

# Start application
pm2 start ecosystem.config.js
pm2 save
pm2 startup  # Follow instructions

# Configure IONOS Firewall (in IONOS Control Panel)
# Allow ports: 22, 80, 443
```

## ✅ Deploy!

```bash
# Push to GitHub
git push origin main

# GitHub Actions automatically deploys! 🎉
```

## 🔧 IONOS-Specific Steps

### Configure IONOS Firewall

1. Log in to **IONOS Control Panel**
2. Go to **Server & Cloud** → **VPS** → Your Server
3. Click **Firewall**
4. Add rules:
   - Allow TCP port **22** (SSH)
   - Allow TCP port **80** (HTTP)
   - Allow TCP port **443** (HTTPS)

### Verify Deployment

```bash
# Check application status
pm2 status

# View logs
pm2 logs price-scraping

# Test application
curl http://localhost:80
```

## 📚 Full Documentation

See [IONOS_DEPLOYMENT.md](./IONOS_DEPLOYMENT.md) for:
- Detailed setup instructions
- Troubleshooting guide
- Security best practices
- Monitoring and maintenance

## 🆘 Common Issues

**Can't connect via SSH?**
- Check IONOS Control Panel → Firewall → Allow port 22
- Verify server IP address

**Deployment fails?**
- Check GitHub Actions logs
- Verify all secrets are set correctly
- Test SSH: `ssh -i ~/.ssh/github_actions root@your-ip`

**App not accessible?**
- Check IONOS Firewall → Allow ports 80, 443
- Check Ubuntu firewall: `sudo ufw allow 80/tcp`

---

**That's it! Your IONOS server is ready for automated deployments.** 🚀

