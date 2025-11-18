# Fix: REVERB_SSH Secret Error

## 🔴 The Problem

Error: "can't connect without a private SSH key or password"

This means the `REVERB_SSH` secret is either:
- ❌ Not set in GitHub
- ❌ Empty
- ❌ Incorrectly formatted

## ✅ Quick Fix

### Step 1: Verify Secret Exists

1. Go to: **Repository → Settings → Secrets → Actions**
2. Look for `REVERB_SSH` in the list
3. If it's missing, you need to add it (see Step 2)
4. If it exists, it might be empty or wrong format (see Step 3)

### Step 2: Generate RSA Key on IONOS Server

```bash
# SSH into your IONOS server
ssh root@your-ionos-ip

# Generate RSA 4096-bit key
ssh-keygen -t rsa -b 4096 -C "github-actions" -f ~/.ssh/github_actions -N ""

# Add public key to authorized_keys
cat ~/.ssh/github_actions.pub >> ~/.ssh/authorized_keys
chmod 600 ~/.ssh/authorized_keys
chmod 700 ~/.ssh

# Display the PRIVATE key (COPY THIS!)
echo "=== COPY FROM HERE ==="
cat ~/.ssh/github_actions
echo "=== TO HERE ==="
```

### Step 3: Add to GitHub Secrets

1. **Go to GitHub:**
   - Repository → **Settings** → **Secrets and variables** → **Actions**

2. **Add/Update REVERB_SSH:**
   - Click **New repository secret** (or edit existing)
   - **Name:** `REVERB_SSH` (exact, case-sensitive)
   - **Value:** Paste the COMPLETE private key from Step 2
   - Must include:
     ```
     -----BEGIN RSA PRIVATE KEY-----
     ... (all lines)
     -----END RSA PRIVATE KEY-----
     ```
   - OR
     ```
     -----BEGIN OPENSSH PRIVATE KEY-----
     ... (all lines)
     -----END OPENSSH PRIVATE KEY-----
     ```
   - Click **Add secret** (or **Update secret**)

### Step 4: Verify Other Secrets

Make sure these are also set:

- ✅ `SERVER_HOST` - Your IONOS server IP
- ✅ `SERVER_USER` - SSH username (usually `root`)
- ✅ `REVERB_SSH` - Complete RSA private key
- ✅ `SSH_PORT` - `22` (optional)
- ✅ `DEPLOY_PATH` - `/var/www/price-scraping` (optional)

## 🔍 Common Issues

### Issue 1: Secret Not Set

**Symptom:** Secret doesn't exist in GitHub

**Fix:**
- Go to Settings → Secrets → Actions
- Click "New repository secret"
- Name: `REVERB_SSH`
- Value: Complete private key

### Issue 2: Secret is Empty

**Symptom:** Secret exists but is empty

**Fix:**
- Click on `REVERB_SSH` secret
- Click "Update"
- Paste the complete private key
- Save

### Issue 3: Wrong Format

**Symptom:** Key is missing BEGIN/END lines

**Wrong:**
```
MIIEpAIBAAKCAQEA... (just the content)
```

**Correct:**
```
-----BEGIN RSA PRIVATE KEY-----
MIIEpAIBAAKCAQEA... (all lines)
-----END RSA PRIVATE KEY-----
```

### Issue 4: Using Public Key

**Symptom:** Pasted public key instead of private key

**Wrong (Public Key):**
```
ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAACAQ...
```

**Correct (Private Key):**
```
-----BEGIN RSA PRIVATE KEY-----
MIIEpAIBAAKCAQEA...
-----END RSA PRIVATE KEY-----
```

### Issue 5: Secret Name Mismatch

**Symptom:** Secret name doesn't match workflow

**Check:**
- Workflow uses: `${{ secrets.REVERB_SSH }}`
- GitHub secret must be named: `REVERB_SSH` (exact match)

## 🧪 Test Before Running Workflow

Test the key works locally:

```bash
# On your local machine
# Save private key to file
nano test_key
# Paste private key, save and exit

# Set permissions
chmod 600 test_key

# Test connection
ssh -i test_key -o StrictHostKeyChecking=no root@your-ionos-ip

# If connection works, key is correct!
# Delete test file
rm test_key
```

## 📋 Verification Checklist

Before running workflow again:

- [ ] `REVERB_SSH` secret exists in GitHub
- [ ] Secret contains complete private key (with BEGIN/END)
- [ ] Public key is in `~/.ssh/authorized_keys` on server
- [ ] `SERVER_HOST` has correct IP
- [ ] `SERVER_USER` has correct username
- [ ] Can connect manually with the key
- [ ] File permissions correct on server (600 for keys)

## 🔧 Debug Mode

The workflow now includes a verification step that will show:
- Which secrets are missing
- Length of REVERB_SSH (to verify it's not empty)

Check GitHub Actions logs after running to see the verification output.

## ✅ Success

When it works, you'll see:
```
✅ All required secrets are set
✅ Deployment completed successfully!
```

---

**After fixing REVERB_SSH, your deployment should work!** 🚀

