# Environment Variables Guide

This document explains how to securely manage environment variables for this project.

## 🔒 Security Best Practices

- **Never commit `.env` files to Git** - They are automatically ignored
- **Use GitHub Secrets** for production deployments
- **Use `.env.example`** as a template for local development
- **Rotate secrets regularly** for security

## 📋 Required Environment Variables

### Application Secrets

| Variable | Required | Description | Example |
|----------|----------|-------------|---------|
| `OPENAI_API_KEY` | ✅ Yes | OpenAI API key for AI-powered features | `sk-...` |
| `PORT` | ❌ No | Server port (default: 80) | `80` |
| `NODE_ENV` | ❌ No | Environment mode (default: production) | `production` |
| `MONGO_URI` | ❌ No | MongoDB connection string (default: mongodb://127.0.0.1:27017/prices) | `mongodb://127.0.0.1:27017/prices` |

## 🚀 Local Development Setup

1. **Copy the example file:**
   ```bash
   cp .env.example .env
   ```

2. **Edit `.env` with your values:**
   ```bash
   nano .env
   ```

3. **Add your actual secrets:**
   ```env
   OPENAI_API_KEY=sk-your-actual-key-here
   PORT=3000
   NODE_ENV=development
   MONGO_URI=mongodb://127.0.0.1:27017/prices
   ```

4. **Start the application:**
   ```bash
   npm start
   ```

## ☁️ Production Deployment (GitHub Secrets)

For CI/CD deployments, store secrets in GitHub Secrets:

### Step 1: Add Secrets to GitHub

1. Go to: **Repository → Settings → Secrets → Actions**
2. Click **New repository secret**
3. Add each secret:

| Secret Name | Value | Required |
|-------------|-------|----------|
| `OPENAI_API_KEY` | Your OpenAI API key | ✅ Yes |
| `PORT` | Server port (usually 80) | ❌ No |
| `NODE_ENV` | `production` | ❌ No |
| `MONGO_URI` | MongoDB connection string | ❌ No |

### Step 2: Deployment Secrets (Also Required)

These are for SSH deployment:

| Secret Name | Value | Required |
|-------------|-------|----------|
| `SERVER_HOST` | Your server IP address | ✅ Yes |
| `SERVER_USER` | SSH username (usually `root`) | ✅ Yes |
| `REVERB_SSH` | SSH private key | ✅ Yes |
| `SSH_PORT` | SSH port (usually 22) | ❌ No |
| `DEPLOY_PATH` | Deployment directory | ❌ No |
| `SSH_PASSPHRASE` | SSH key passphrase (if any) | ❌ No |

### Step 3: Automatic .env Creation

The CI/CD workflow automatically creates the `.env` file on the server from GitHub Secrets during deployment. You don't need to manually create it!

## 🔍 How It Works

### Local Development
- Application reads `.env` file using `dotenv` package
- `.env` is in `.gitignore` (never committed)

### Production Deployment
- GitHub Actions workflow injects secrets into `.env` file on server
- Secrets are stored securely in GitHub Secrets
- `.env` file is created with secure permissions (600)

## 🛡️ Security Checklist

- [ ] `.env` is in `.gitignore` ✅
- [ ] `.env.example` exists with placeholders ✅
- [ ] GitHub Secrets are configured for production
- [ ] `.env` file permissions are set to 600 (read/write for owner only)
- [ ] Secrets are rotated regularly
- [ ] No secrets in code or commit history

## 🔄 Updating Secrets

### Update GitHub Secrets:
1. Go to: **Repository → Settings → Secrets → Actions**
2. Click on the secret name
3. Click **Update**
4. Enter new value
5. Click **Update secret**
6. Redeploy (push to main or trigger workflow)

### Update Local .env:
1. Edit `.env` file directly
2. Restart application

## ⚠️ Troubleshooting

### "OPENAI_API_KEY is not set"
- **Local:** Check `.env` file exists and has `OPENAI_API_KEY=...`
- **Production:** Add `OPENAI_API_KEY` to GitHub Secrets

### "MongoDB connection failed"
- Check `MONGO_URI` is correct
- Verify MongoDB is running: `systemctl status mongod`
- Check MongoDB is accessible: `mongosh mongodb://127.0.0.1:27017/prices`

### "Port already in use"
- Change `PORT` in `.env` or GitHub Secrets
- Or stop the service using the port: `sudo lsof -i :80`

## 📚 Related Documentation

- [GitHub Secrets Setup Guide](./GITHUB_SECRETS_SETUP.md)
- [IONOS Deployment Guide](./IONOS_DEPLOYMENT.md)
- [CI/CD Workflow](./.github/workflows/deploy.yml)

---

**Remember:** Never share your `.env` file or commit it to Git! 🔒

