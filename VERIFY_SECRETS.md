# Verify GitHub Secrets Are Set Correctly

## 🔍 Quick Check

The error "can't connect without a private SSH key or password" means the `REVERB_SSH` secret is missing or incorrectly formatted.

## ✅ Step 1: Verify Secret Exists

1. Go to your GitHub repository
2. Click **Settings** → **Secrets and variables** → **Actions**
3. Look for `REVERB_SSH` in the list
4. If it's NOT there, you need to add it (see below)
5. If it IS there, it might be incorrectly formatted

## 🔧 Step 2: Check Secret Format

The `REVERB_SSH` secret must contain a complete RSA private key.

### Correct Format:

```
-----BEGIN RSA PRIVATE KEY-----
MIIEpAIBAAKCAQEA... (many lines of base64)
-----END RSA PRIVATE KEY-----
```

OR

```
-----BEGIN OPENSSH PRIVATE KEY-----
b3BlbnNzaC1rZXktdjEAAAAABG5vbmUAAAAEbm9uZQAAAAAAAAABAAABlwAAAAdzc2gtcn
... (many lines)
-----END OPENSSH PRIVATE KEY-----
```

### Common Issues:

❌ **Missing BEGIN/END lines**
❌ **Extra spaces at start/end**
❌ **Using public key instead of private key**
❌ **Key doesn't match server**

## 🔑 Step 3: Generate and Add Correct Key

### On IONOS Server:

```bash
# SSH into server
ssh root@your-ionos-ip

# Generate RSA key
ssh-keygen -t rsa -b 4096 -C "github-actions" -f ~/.ssh/github_actions -N ""

# Add public key to authorized_keys
cat ~/.ssh/github_actions.pub >> ~/.ssh/authorized_keys
chmod 600 ~/.ssh/authorized_keys

# Display private key
echo "=== COPY FROM HERE ==="
cat ~/.ssh/github_actions
echo "=== TO HERE ==="
```

### In GitHub:

1. Go to **Settings** → **Secrets** → **Actions**
2. Click on `REVERB_SSH` (or create new)
3. Click **Update** (or **Add secret**)
4. **Delete everything** in the value field
5. Paste the complete private key from server
6. Make sure it starts with `-----BEGIN` and ends with `-----END`
7. Click **Update secret**

## 🧪 Step 4: Test Locally

Before running GitHub Actions, test the key works:

```bash
# On your local machine
# Save the private key to a file
nano test_key
# Paste the private key, save and exit

# Set permissions
chmod 600 test_key

# Test connection
ssh -i test_key -o StrictHostKeyChecking=no root@your-ionos-ip

# If this works, the key is correct!
# Delete test file
rm test_key
```

## 📋 Complete Secret Checklist

Verify ALL these secrets are set:

- [ ] `SERVER_HOST` - Your IONOS server IP
- [ ] `SERVER_USER` - SSH username (usually `root`)
- [ ] `REVERB_SSH` - Complete RSA private key (with BEGIN/END)
- [ ] `SSH_PORT` - `22` (optional, but recommended)
- [ ] `DEPLOY_PATH` - `/var/www/price-scraping` (optional)

## 🔍 Debug: Enable Verbose Logging

Temporarily add debug mode to see what's happening:

```yaml
- name: Deploy to Ubuntu Server
  uses: appleboy/ssh-action@v0.1.7
  with:
    host: ${{ secrets.SERVER_HOST }}
    username: ${{ secrets.SERVER_USER }}
    key: ${{ secrets.REVERB_SSH }}
    port: ${{ secrets.SSH_PORT || 22 }}
    debug: true  # Add this line
    script: |
      # your script
```

This will show more details in the GitHub Actions logs.

## ⚠️ Common Mistakes

### Mistake 1: Secret Name Mismatch
- Workflow uses: `REVERB_SSH`
- GitHub secret must be named: `REVERB_SSH` (exact match, case-sensitive)

### Mistake 2: Using Public Key
- ❌ Public key starts with: `ssh-rsa AAAAB3NzaC1yc2E...`
- ✅ Private key starts with: `-----BEGIN RSA PRIVATE KEY-----`

### Mistake 3: Incomplete Key
- Must include ALL lines from BEGIN to END
- No truncation

### Mistake 4: Wrong Server
- Make sure `SERVER_HOST` matches your actual IONOS server IP
- Make sure `SERVER_USER` matches the actual username on server

## ✅ Success Test

After fixing, you should see in GitHub Actions:
```
✅ Deployment completed successfully!
```

If you still see the error, check:
1. Secret name is exactly `REVERB_SSH`
2. Private key is complete (with BEGIN/END)
3. Public key is in `~/.ssh/authorized_keys` on server
4. Server IP and username are correct

