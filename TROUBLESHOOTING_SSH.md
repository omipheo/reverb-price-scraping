# Troubleshooting SSH Connection Issues

## Error: "can't connect without a private SSH key or password"

This error means GitHub Actions cannot authenticate with your IONOS server.

## 🔍 Common Causes & Solutions

### 1. SSH_PRIVATE_KEY Secret Not Set

**Problem:** The secret doesn't exist in GitHub.

**Solution:**
1. Go to your GitHub repository
2. Navigate to **Settings** → **Secrets and variables** → **Actions**
3. Check if `SSH_PRIVATE_KEY` exists
4. If not, click **New repository secret** and add it

### 2. SSH_PRIVATE_KEY Format Issues

**Problem:** The private key has incorrect formatting (extra spaces, missing lines, etc.)

**Solution:**

The private key must include:
- ✅ The header: `-----BEGIN OPENSSH PRIVATE KEY-----`
- ✅ The footer: `-----END OPENSSH PRIVATE KEY-----`
- ✅ All content between (including line breaks)
- ✅ No extra spaces at the beginning/end

**Correct Format:**
```
-----BEGIN OPENSSH PRIVATE KEY-----
b3BlbnNzaC1rZXktdjEAAAAABG5vbmUAAAAEbm9uZQAAAAAAAAABAAABlwAAAAdzc2gtcn
NhAAAAAwEAAQAAAYEA... (more lines)
-----END OPENSSH PRIVATE KEY-----
```

### 3. Wrong SSH Key

**Problem:** The key in GitHub Secrets doesn't match the public key on the server.

**Solution:**

**On IONOS Server:**
```bash
# Check the public key on server
cat ~/.ssh/authorized_keys

# Generate new key pair if needed
ssh-keygen -t rsa -b 4096 -C "github-actions" -f ~/.ssh/github_actions -N ""
cat ~/.ssh/github_actions.pub >> ~/.ssh/authorized_keys

# Display the NEW private key
cat ~/.ssh/github_actions
```

**Then update GitHub Secret:**
1. Copy the entire private key (including BEGIN/END lines)
2. Go to GitHub → Settings → Secrets → Actions
3. Edit `SSH_PRIVATE_KEY` secret
4. Paste the complete key
5. Save

### 4. SSH Key Permissions on Server

**Problem:** Wrong file permissions on the server.

**Solution:**
```bash
# On IONOS server
chmod 700 ~/.ssh
chmod 600 ~/.ssh/authorized_keys
chmod 600 ~/.ssh/github_actions
```

### 5. Wrong Username

**Problem:** `SERVER_USER` secret doesn't match the actual username on the server.

**Solution:**
```bash
# On IONOS server, check current user
whoami

# Update GitHub Secret SERVER_USER with correct username
# Common values: root, ubuntu, deploy, or your custom username
```

### 6. Wrong Host/IP

**Problem:** `SERVER_HOST` secret has incorrect IP address.

**Solution:**
1. Verify your IONOS server IP:
   - Check IONOS Control Panel → Server & Cloud → VPS
   - Or run on server: `hostname -I`
2. Update `SERVER_HOST` secret with correct IP

### 7. SSH Port Blocked

**Problem:** Port 22 is blocked by firewall.

**Solution:**

**IONOS Control Panel:**
1. Go to Server & Cloud → VPS → Your Server
2. Click Firewall
3. Ensure port 22 (SSH) is allowed

**On Server:**
```bash
# Check if SSH is running
sudo systemctl status ssh

# Check if port 22 is listening
sudo netstat -tulpn | grep :22

# If not, start SSH service
sudo systemctl start ssh
sudo systemctl enable ssh
```

## 🔧 Step-by-Step Fix

### Step 1: Generate New SSH Key Pair

**On IONOS Server:**
```bash
# Connect to server
ssh root@your-ionos-ip

# Generate new key
ssh-keygen -t rsa -b 4096 -C "github-actions" -f ~/.ssh/github_actions -N ""

# Add public key to authorized_keys
cat ~/.ssh/github_actions.pub >> ~/.ssh/authorized_keys

# Set correct permissions
chmod 700 ~/.ssh
chmod 600 ~/.ssh/authorized_keys
chmod 600 ~/.ssh/github_actions

# Display private key (COPY THIS ENTIRELY)
echo "=== COPY FROM HERE ==="
cat ~/.ssh/github_actions
echo "=== TO HERE ==="
```

### Step 2: Test SSH Connection Locally

**On your local machine:**
```bash
# Save the private key to a file
nano test_key
# Paste the private key, save and exit

# Set permissions
chmod 600 test_key

# Test connection
ssh -i test_key -o StrictHostKeyChecking=no root@your-ionos-ip

# If this works, the key is correct
```

### Step 3: Add to GitHub Secrets

1. **Copy the private key** (from Step 1)
   - Include `-----BEGIN OPENSSH PRIVATE KEY-----`
   - Include all content
   - Include `-----END OPENSSH PRIVATE KEY-----`
   - No extra spaces

2. **Go to GitHub:**
   - Repository → Settings → Secrets and variables → Actions

3. **Update SSH_PRIVATE_KEY:**
   - Click on `SSH_PRIVATE_KEY` secret
   - Click "Update"
   - Paste the complete key
   - Click "Update secret"

4. **Verify other secrets:**
   - `SERVER_HOST` - Your IONOS server IP
   - `SERVER_USER` - Username (usually `root`)
   - `SSH_PORT` - Usually `22`
   - `DEPLOY_PATH` - Usually `/var/www/price-scraping`

### Step 4: Test Deployment

1. Go to GitHub → Actions
2. Click "Run workflow" (or push a commit)
3. Watch the logs
4. Should see successful connection

## 🧪 Debugging Tips

### Enable Debug Mode in Workflow

Temporarily add debug to see what's happening:

```yaml
- name: Deploy to Ubuntu Server
  uses: appleboy/ssh-action@v0.1.7
  with:
    host: ${{ secrets.SERVER_HOST }}
    username: ${{ secrets.SERVER_USER }}
    key: ${{ secrets.SSH_PRIVATE_KEY }}
    port: ${{ secrets.SSH_PORT || 22 }}
    debug: true  # Add this
    script: |
      # your script
```

### Check GitHub Actions Logs

1. Go to Actions tab
2. Click on the failed workflow run
3. Expand "Deploy to Ubuntu Server" step
4. Look for detailed error messages

### Verify Secrets Are Set

The workflow uses these secrets. Verify all are set:
- ✅ `SERVER_HOST`
- ✅ `SERVER_USER`
- ✅ `SSH_PRIVATE_KEY`
- ✅ `SSH_PORT` (optional, defaults to 22)
- ✅ `DEPLOY_PATH` (optional, defaults to /var/www/price-scraping)

## 📋 Quick Checklist

- [ ] SSH_PRIVATE_KEY secret exists in GitHub
- [ ] Private key includes BEGIN and END lines
- [ ] Public key is in ~/.ssh/authorized_keys on server
- [ ] File permissions are correct (600 for keys, 700 for .ssh)
- [ ] SERVER_HOST has correct IP address
- [ ] SERVER_USER matches actual username on server
- [ ] Port 22 is open in IONOS firewall
- [ ] SSH service is running on server
- [ ] Can connect manually: `ssh -i key user@host`

## 🔒 Security Note

After testing, remove the test_key file from your local machine:
```bash
rm test_key
```

Never commit private keys to git!

