# Fix: "can't connect without a private SSH key or password"

## 🔴 The Problem

GitHub Actions cannot authenticate with your IONOS server because the SSH private key is missing or incorrectly formatted.

## ✅ Quick Fix (3 Steps)

### Step 1: Generate SSH Key on IONOS Server

**SSH into your IONOS server:**
```bash
ssh root@your-ionos-ip
```

**Generate new SSH key:**
```bash
# Generate key pair (RSA 4096-bit)
ssh-keygen -t rsa -b 4096 -C "github-actions" -f ~/.ssh/github_actions -N ""

# Add public key to authorized_keys
cat ~/.ssh/github_actions.pub >> ~/.ssh/authorized_keys

# Set correct permissions
chmod 700 ~/.ssh
chmod 600 ~/.ssh/authorized_keys
chmod 600 ~/.ssh/github_actions

# Display the PRIVATE key (COPY THIS ENTIRELY!)
echo "=== COPY FROM HERE ==="
cat ~/.ssh/github_actions
echo "=== TO HERE ==="
```

**Important:** Copy the ENTIRE output, including:
- `-----BEGIN RSA PRIVATE KEY-----` or `-----BEGIN OPENSSH PRIVATE KEY-----`
- All the content in between
- `-----END RSA PRIVATE KEY-----` or `-----END OPENSSH PRIVATE KEY-----`

**Note:** RSA keys may show either format - both work fine!

### Step 2: Add to GitHub Secrets

1. **Go to GitHub:**
   - Your Repository → **Settings** → **Secrets and variables** → **Actions**

2. **Update SSH_PRIVATE_KEY:**
   - Click on `SSH_PRIVATE_KEY` (or create new if it doesn't exist)
   - Click **Update** (or **Add secret**)
   - **Paste the complete private key** from Step 1
   - Make sure there are NO extra spaces at the beginning or end
   - Click **Update secret**

3. **Verify other secrets are set:**
   - `SERVER_HOST` - Your IONOS server IP (e.g., `123.45.67.89`)
   - `SERVER_USER` - Username (usually `root` for IONOS)
   - `SSH_PORT` - Usually `22`
   - `DEPLOY_PATH` - Usually `/var/www/price-scraping`

### Step 3: Test the Connection

**Option A: Test via GitHub Actions**
1. Go to **Actions** tab
2. Click **Run workflow** (or push a commit)
3. Watch the deployment - it should work now!

**Option B: Test Locally First**
```bash
# On your local machine, save the private key
nano test_key
# Paste the private key, save and exit

# Set permissions
chmod 600 test_key

# Test connection
ssh -i test_key -o StrictHostKeyChecking=no root@your-ionos-ip

# If this works, the key is correct!
# Delete test file after
rm test_key
```

## 🔍 Common Mistakes

### ❌ Wrong: Missing BEGIN/END lines
```
b3BlbnNzaC1rZXktdjEAAAAABG5vbmUAAAAEbm9uZQAAAAAAAAABAAABlwAAAAdzc2gtcn
```
**Fix:** Must include BEGIN and END lines. RSA keys use:
- `-----BEGIN RSA PRIVATE KEY-----` / `-----END RSA PRIVATE KEY-----`
- OR `-----BEGIN OPENSSH PRIVATE KEY-----` / `-----END OPENSSH PRIVATE KEY-----`

### ❌ Wrong: Extra spaces or line breaks
```
-----BEGIN OPENSSH PRIVATE KEY-----
  b3BlbnNzaC1rZXktdjEAAAAABG5vbmUAAAAEbm9uZQAAAAAAAAABAAABlwAAAAdzc2gtcn
-----END OPENSSH PRIVATE KEY-----
```
**Fix:** No extra spaces at the beginning of lines

### ❌ Wrong: Using public key instead of private key
```
ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAACAQ... (starts with ssh-rsa)
```
**Fix:** Use the PRIVATE key (starts with `-----BEGIN RSA` or `-----BEGIN OPENSSH`), not the public key (starts with `ssh-rsa`)

### ❌ Wrong: Key doesn't match server
**Fix:** The public key must be in `~/.ssh/authorized_keys` on the server

## 📋 Verification Checklist

Before running the workflow again, verify:

- [ ] SSH key generated on IONOS server
- [ ] Public key added to `~/.ssh/authorized_keys`
- [ ] Private key copied completely (with BEGIN/END lines)
- [ ] `SSH_PRIVATE_KEY` secret updated in GitHub
- [ ] `SERVER_HOST` secret has correct IP
- [ ] `SERVER_USER` secret has correct username
- [ ] File permissions correct on server (600 for keys, 700 for .ssh)
- [ ] Can connect manually with the key

## 🧪 Debug Mode

If still having issues, temporarily enable debug mode in the workflow:

```yaml
- name: Deploy to Ubuntu Server
  uses: appleboy/ssh-action@v0.1.7
  with:
    host: ${{ secrets.SERVER_HOST }}
    username: ${{ secrets.SERVER_USER }}
    key: ${{ secrets.SSH_PRIVATE_KEY }}
    port: ${{ secrets.SSH_PORT || 22 }}
    debug: true  # Add this line
    script: |
      # your script
```

This will show more detailed connection information in the logs.

## 🆘 Still Not Working?

1. **Check GitHub Actions logs:**
   - Go to Actions tab → Click on failed run
   - Expand "Deploy to Ubuntu Server" step
   - Look for specific error messages

2. **Verify secrets are actually set:**
   - Go to Settings → Secrets → Actions
   - Make sure all required secrets exist
   - Check that `SSH_PRIVATE_KEY` is not empty

3. **Test SSH connection manually:**
   ```bash
   # On your local machine
   ssh -i ~/.ssh/github_actions root@your-ionos-ip
   ```
   If this doesn't work, the key is wrong.

4. **Check IONOS firewall:**
   - IONOS Control Panel → Server & Cloud → VPS → Firewall
   - Ensure port 22 (SSH) is allowed

5. **Check SSH service on server:**
   ```bash
   # On IONOS server
   sudo systemctl status ssh
   sudo systemctl start ssh  # If not running
   ```

## ✅ Success Indicators

When it works, you'll see in GitHub Actions logs:
```
✅ Deployment completed successfully!
```

And in the server logs:
```
[PM2] Process price-scraping restarted
```

---

**After fixing, your deployments should work automatically!** 🚀

