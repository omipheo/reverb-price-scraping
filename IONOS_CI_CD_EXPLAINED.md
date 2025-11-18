# IONOS CI/CD Pipeline - How It Works

Visual explanation of the automated deployment process to IONOS server.

## 🔄 Deployment Flow

```
┌─────────────────┐
│  Developer      │
│  (Your Machine) │
└────────┬────────┘
         │
         │ git push origin main
         ▼
┌─────────────────┐
│   GitHub        │
│   Repository    │
└────────┬────────┘
         │
         │ Triggers workflow
         ▼
┌─────────────────────────────────┐
│   GitHub Actions                │
│   (CI/CD Pipeline)              │
│                                 │
│   1. Checkout code              │
│   2. Setup Node.js              │
│   3. Install dependencies       │
│   4. Run tests (if any)         │
│   5. Deploy via SSH             │
└────────┬────────────────────────┘
         │
         │ SSH connection
         │ (using secrets)
         ▼
┌─────────────────────────────────┐
│   IONOS Server                  │
│   (Ubuntu VPS)                  │
│                                 │
│   1. Pull latest code           │
│   2. Install dependencies       │
│   3. Restart PM2 process        │
│   4. Application running! ✅    │
└─────────────────────────────────┘
```

## 📋 Step-by-Step Process

### 1. Developer Pushes Code

```bash
git add .
git commit -m "New feature"
git push origin main
```

### 2. GitHub Actions Triggered

When code is pushed to `main` or `master` branch, GitHub Actions automatically starts.

**Workflow file:** `.github/workflows/deploy.yml`

### 3. CI/CD Pipeline Executes

The pipeline runs these steps:

#### Step 1: Checkout Code
```yaml
- name: Checkout code
  uses: actions/checkout@v3
```
- Gets the latest code from your repository

#### Step 2: Setup Node.js
```yaml
- name: Setup Node.js
  uses: actions/setup-node@v3
  with:
    node-version: '18'
```
- Installs Node.js 18 on the GitHub Actions runner

#### Step 3: Install Dependencies
```yaml
- name: Install dependencies
  run: npm ci
```
- Installs all npm packages
- Validates `package-lock.json` matches `package.json`

#### Step 4: Run Tests
```yaml
- name: Run tests (if any)
  run: npm test || echo "No tests configured"
```
- Runs your test suite (if configured)
- Continues even if tests fail (for now)

#### Step 5: Deploy to IONOS Server
```yaml
- name: Deploy to Ubuntu Server
  uses: appleboy/ssh-action@v0.1.7
  with:
    host: ${{ secrets.SERVER_HOST }}
    username: ${{ secrets.SERVER_USER }}
    key: ${{ secrets.SSH_PRIVATE_KEY }}
```

This step:
1. **Connects to IONOS server** via SSH using your secrets
2. **Executes deployment script** on the server:
   ```bash
   cd /var/www/price-scraping
   git fetch origin
   git reset --hard origin/main
   npm ci --production
   pm2 restart price-scraping
   pm2 save
   ```

### 4. IONOS Server Updates

On your IONOS server:

1. **Pulls latest code** from GitHub
2. **Installs production dependencies** (`npm ci --production`)
3. **Restarts application** using PM2
4. **Saves PM2 configuration** for auto-restart on reboot

### 5. Application Running

Your application is now live on IONOS server! 🎉

## 🔐 Security: How Secrets Work

GitHub Secrets are encrypted variables stored in your repository settings.

**Secrets used:**
- `SERVER_HOST` - Your IONOS server IP address
- `SERVER_USER` - SSH username (usually `root` or `deploy`)
- `SSH_PRIVATE_KEY` - Private SSH key for authentication
- `SSH_PORT` - SSH port (usually 22)
- `DEPLOY_PATH` - Deployment directory path

**Security features:**
- ✅ Secrets are encrypted at rest
- ✅ Only accessible during workflow execution
- ✅ Never displayed in logs
- ✅ Can be masked in output

## 🎯 Key Components

### GitHub Actions Workflow

**Location:** `.github/workflows/deploy.yml`

**Triggers:**
- Push to `main` or `master` branch
- Manual trigger via GitHub UI

**Actions Used:**
- `actions/checkout@v3` - Get code
- `actions/setup-node@v3` - Setup Node.js
- `appleboy/ssh-action@v0.1.7` - SSH deployment

### IONOS Server Requirements

- ✅ Ubuntu/Linux server
- ✅ SSH access enabled
- ✅ Node.js 18+ installed
- ✅ PM2 installed
- ✅ Git installed
- ✅ MongoDB running
- ✅ Firewall configured (ports 22, 80, 443)

### PM2 Process Manager

PM2 keeps your application running:
- ✅ Auto-restart on crash
- ✅ Auto-start on server reboot
- ✅ Log management
- ✅ Process monitoring

## 📊 Monitoring Deployment

### GitHub Actions

1. Go to your repository
2. Click **Actions** tab
3. See workflow runs in real-time
4. Click on a run to see detailed logs

### IONOS Server

```bash
# SSH into server
ssh root@your-ionos-ip

# Check PM2 status
pm2 status

# View logs
pm2 logs price-scraping

# Monitor resources
pm2 monit
```

## 🔄 Rollback Process

If deployment causes issues:

### Option 1: Revert via GitHub

```bash
# Revert last commit
git revert HEAD
git push origin main
# Triggers new deployment with previous code
```

### Option 2: Manual Rollback on Server

```bash
# SSH into IONOS server
ssh root@your-ionos-ip
cd /var/www/price-scraping

# Find previous commit
git log --oneline

# Reset to previous commit
git reset --hard <previous-commit-hash>
npm ci --production
pm2 restart price-scraping
```

## 🎓 Understanding the Workflow File

```yaml
name: Deploy to Ubuntu Server

on:
  push:
    branches:
      - main      # Triggers on push to main
      - master    # Or master branch
  workflow_dispatch:  # Allows manual trigger

jobs:
  deploy:
    runs-on: ubuntu-latest  # GitHub Actions runner
    
    steps:
    # Each step runs sequentially
    # If any step fails, workflow stops
```

## ✅ Benefits of CI/CD

1. **Automated Deployment** - No manual steps needed
2. **Consistent Process** - Same steps every time
3. **Fast Feedback** - See deployment status immediately
4. **Rollback Capability** - Easy to revert if needed
5. **History Tracking** - All deployments logged in GitHub
6. **Team Collaboration** - Everyone uses same process

## 🚀 Next Steps

1. ✅ Set up IONOS server (see [IONOS_QUICK_START.md](./IONOS_QUICK_START.md))
2. ✅ Configure GitHub Secrets
3. ✅ Push code and watch it deploy!
4. ✅ Monitor deployments in GitHub Actions
5. ✅ Check application on IONOS server

---

**Your CI/CD pipeline is ready! Just push code and it deploys automatically.** 🎉

