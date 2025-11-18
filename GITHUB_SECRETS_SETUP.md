# How to Set GitHub Secrets for CI/CD

Step-by-step guide to configure GitHub Secrets for automated deployment.

## 📋 Required Secrets

Based on your `deploy.yml` file, you need these secrets:

| Secret Name | Description | Example Value |
|------------|-------------|---------------|
| `SERVER_HOST` | IONOS server IP address or domain | `123.45.67.89` |
| `SERVER_USER` | SSH username | `root` or `deploy` |
| `REVERB_SSH` | SSH private key (RSA) | `-----BEGIN RSA PRIVATE KEY-----...` |
| `SSH_PORT` | SSH port (optional) | `22` |
| `DEPLOY_PATH` | Deployment directory (optional) | `/var/www/price-scraping` |

## 🔐 Step-by-Step: Setting GitHub Secrets

### Step 1: Access Repository Settings

1. **Go to your GitHub repository**
2. Click on the **Settings** tab (top menu)
3. In the left sidebar, click **Secrets and variables**
4. Click **Actions**

### Step 2: Add Each Secret

For each secret below, follow these steps:

1. Click **New repository secret** button (top right)
2. Enter the secret name (exactly as shown)
3. Enter the secret value
4. Click **Add secret**

### Step 3: Add Required Secrets

#### Secret 1: `SERVER_HOST`

**Name:** `SERVER_HOST`

**Value:** Your IONOS server IP address
```
123.45.67.89
```
Or if you have a domain:
```
yourdomain.com
```

**How to find:**
- Check IONOS Control Panel → Server & Cloud → VPS → Your Server
- Or run on server: `hostname -I`

---

#### Secret 2: `SERVER_USER`

**Name:** `SERVER_USER`

**Value:** SSH username on your IONOS server
```
root
```
Or if you created a custom user:
```
deploy
```

**How to find:**
- Usually `root` for IONOS servers
- Or run on server: `whoami`

---

#### Secret 3: `REVERB_SSH` ⚠️

**Name:** `REVERB_SSH` (Note: This is your SSH private key)

**Value:** Complete RSA private key from your IONOS server

**How to get it:**

1. **SSH into your IONOS server:**
   ```bash
   ssh root@your-ionos-ip
   ```

2. **Generate RSA key (if not already done):**
   ```bash
   ssh-keygen -t rsa -b 4096 -C "github-actions" -f ~/.ssh/github_actions -N ""
   cat ~/.ssh/github_actions.pub >> ~/.ssh/authorized_keys
   chmod 600 ~/.ssh/authorized_keys
   ```

3. **Display the private key:**
   ```bash
   cat ~/.ssh/github_actions
   ```

4. **Copy the ENTIRE output**, including:
   ```
   -----BEGIN RSA PRIVATE KEY-----
   MIIEpAIBAAKCAQEA... (many lines)
   -----END RSA PRIVATE KEY-----
   ```
   OR
   ```
   -----BEGIN OPENSSH PRIVATE KEY-----
   b3BlbnNzaC1rZXktdjEAAAAABG5vbmUAAAAEbm9uZQAAAAAAAAABAAABlwAAAAdzc2gtcn
   ... (many lines)
   -----END OPENSSH PRIVATE KEY-----
   ```

5. **Paste into GitHub Secret:**
   - Name: `REVERB_SSH`
   - Value: Paste the complete private key (with BEGIN/END lines)
   - **Important:** No extra spaces at the beginning or end!

---

#### Secret 4: `SSH_PORT` (Optional)

**Name:** `SSH_PORT`

**Value:** SSH port number
```
22
```

**Note:** If not set, defaults to 22. Only set if using a different port.

---

#### Secret 5: `DEPLOY_PATH` (Optional)

**Name:** `DEPLOY_PATH`

**Value:** Path where your application is deployed
```
/var/www/price-scraping
```

**Note:** If not set, defaults to `/var/www/price-scraping`. Only set if using a different path.

---

## ✅ Verify Secrets Are Set

1. Go to **Settings** → **Secrets and variables** → **Actions**
2. You should see all your secrets listed:
   - ✅ `SERVER_HOST`
   - ✅ `SERVER_USER`
   - ✅ `REVERB_SSH`
   - ✅ `SSH_PORT` (optional)
   - ✅ `DEPLOY_PATH` (optional)

**Note:** Secret values are hidden for security - you can only see their names.

## 🔄 Update Existing Secrets

To update a secret:

1. Go to **Settings** → **Secrets and variables** → **Actions**
2. Find the secret you want to update
3. Click the **pencil icon** (✏️) next to it
4. Update the value
5. Click **Update secret**

## 🗑️ Delete Secrets

To delete a secret:

1. Go to **Settings** → **Secrets and variables** → **Actions**
2. Find the secret you want to delete
3. Click the **trash icon** (🗑️) next to it
4. Confirm deletion

## 📸 Visual Guide

```
GitHub Repository
  └── Settings (top menu)
      └── Secrets and variables (left sidebar)
          └── Actions
              └── New repository secret (button)
                  ├── Name: SERVER_HOST
                  ├── Value: 123.45.67.89
                  └── Add secret
```

## ⚠️ Important Notes

1. **Secret Names Are Case-Sensitive**
   - ✅ `SERVER_HOST` (correct)
   - ❌ `server_host` (wrong)
   - ❌ `Server_Host` (wrong)

2. **Private Key Format**
   - Must include BEGIN and END lines
   - No extra spaces
   - Copy the entire key

3. **Secrets Are Encrypted**
   - GitHub encrypts secrets at rest
   - Only accessible during workflow execution
   - Never displayed in logs (unless you explicitly print them)

4. **Organization vs Repository Secrets**
   - Repository secrets: Only for this repository
   - Organization secrets: Available to all repos in organization

## 🧪 Test Your Secrets

After setting all secrets:

1. Go to **Actions** tab
2. Click **Run workflow** (or push a commit)
3. Watch the workflow run
4. If secrets are correct, deployment should succeed!

## 🔍 Troubleshooting

### Secret Not Found Error

**Error:** `Secret 'REVERB_SSH' not found`

**Fix:**
- Check secret name matches exactly (case-sensitive)
- Verify secret exists in Settings → Secrets → Actions

### Connection Still Fails

**Check:**
1. `SERVER_HOST` has correct IP
2. `SERVER_USER` matches actual username
3. `REVERB_SSH` has complete private key (with BEGIN/END)
4. Public key is in `~/.ssh/authorized_keys` on server

### Wrong Secret Name

If your workflow uses `REVERB_SSH` but you want to use `SSH_PRIVATE_KEY`:

**Option 1:** Update the secret name in GitHub to match workflow
- Create new secret: `REVERB_SSH`
- Delete old secret: `SSH_PRIVATE_KEY` (if exists)

**Option 2:** Update workflow to use different name
- Change `key: ${{ secrets.REVERB_SSH }}` to `key: ${{ secrets.SSH_PRIVATE_KEY }}`

## 📝 Quick Checklist

Before running deployment:

- [ ] `SERVER_HOST` - IONOS server IP
- [ ] `SERVER_USER` - SSH username (usually `root`)
- [ ] `REVERB_SSH` - Complete RSA private key
- [ ] `SSH_PORT` - Port 22 (optional)
- [ ] `DEPLOY_PATH` - `/var/www/price-scraping` (optional)

---

**Your GitHub Secrets are now configured! Push code and watch it deploy automatically.** 🚀

