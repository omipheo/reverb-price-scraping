# Fix: "this private key is passphrase protected"

## 🔴 The Problem

Error: `ssh.ParsePrivateKey: ssh: this private key is passphrase protected`

Your SSH private key has a passphrase, but GitHub Actions doesn't have it. We need to either:
1. **Remove the passphrase** from the key (recommended)
2. **Add the passphrase** to GitHub Secrets

## ✅ Solution 1: Remove Passphrase (Recommended)

### Step 1: Generate New Key WITHOUT Passphrase

**On IONOS Server:**
```bash
# SSH into server
ssh root@your-ionos-ip

# Remove old key (if exists)
rm ~/.ssh/github_actions ~/.ssh/github_actions.pub

# Generate NEW key WITHOUT passphrase (note the -N "" means no passphrase)
ssh-keygen -t rsa -b 4096 -C "github-actions" -f ~/.ssh/github_actions -N ""

# Verify no passphrase was set (should not prompt for password)
ssh-keygen -y -f ~/.ssh/github_actions

# Add public key to authorized_keys
cat ~/.ssh/github_actions.pub >> ~/.ssh/authorized_keys
chmod 600 ~/.ssh/authorized_keys
chmod 700 ~/.ssh

# Display the NEW private key (COPY THIS!)
echo "=== COPY FROM HERE ==="
cat ~/.ssh/github_actions
echo "=== TO HERE ==="
```

**Important:** The `-N ""` flag means NO passphrase. Make sure you see:
```
Enter passphrase (empty for no passphrase):
Enter same passphrase again:
```
Just press Enter twice (no password).

### Step 2: Update GitHub Secret

1. Go to: **Repository → Settings → Secrets → Actions**
2. Click on `REVERB_SSH`
3. Click **Update**
4. **Delete the old key**
5. **Paste the NEW key** (without passphrase)
6. Click **Update secret**

### Step 3: Test

Run the workflow again - it should work now!

## ✅ Solution 2: Add Passphrase to GitHub Secrets

If you want to keep the passphrase-protected key:

### Step 1: Add Passphrase Secret

1. Go to: **Repository → Settings → Secrets → Actions**
2. Click **New repository secret**
3. **Name:** `SSH_PASSPHRASE`
4. **Value:** Your SSH key passphrase
5. Click **Add secret**

### Step 2: Workflow Already Updated

The workflow now includes:
```yaml
passphrase: ${{ secrets.SSH_PASSPHRASE || '' }}
```

This will use the passphrase if set, or empty string if not.

## 🔍 Verify Key Has No Passphrase

**On IONOS Server:**
```bash
# Test if key requires passphrase
ssh-keygen -y -f ~/.ssh/github_actions

# If it prompts for passphrase, the key has one
# If it shows the public key immediately, no passphrase ✅
```

## 📋 Quick Fix Checklist

- [ ] Generate new key with `-N ""` (no passphrase)
- [ ] Verify key has no passphrase: `ssh-keygen -y -f ~/.ssh/github_actions`
- [ ] Add public key to `~/.ssh/authorized_keys`
- [ ] Copy new private key (with BEGIN/END lines)
- [ ] Update `REVERB_SSH` secret in GitHub
- [ ] Test deployment

## 🧪 Test Key Locally

Before updating GitHub, test the key works:

```bash
# On your local machine
# Save private key to file
nano test_key
# Paste private key, save and exit

# Set permissions
chmod 600 test_key

# Test connection (should NOT prompt for passphrase)
ssh -i test_key -o StrictHostKeyChecking=no root@your-ionos-ip

# If it works without asking for password, key is correct!
# Delete test file
rm test_key
```

## ⚠️ Common Mistakes

### ❌ Wrong: Key Generated with Passphrase
```bash
ssh-keygen -t rsa -b 4096 -C "github-actions" -f ~/.ssh/github_actions
# When prompted, entered a password ❌
```

### ✅ Correct: Key Generated WITHOUT Passphrase
```bash
ssh-keygen -t rsa -b 4096 -C "github-actions" -f ~/.ssh/github_actions -N ""
# -N "" means no passphrase ✅
```

## 🔒 Security Note

For CI/CD, it's recommended to use keys WITHOUT passphrases because:
- Keys are stored encrypted in GitHub Secrets
- No need to store passphrase separately
- Simpler deployment process

The key itself is still secure because:
- It's encrypted in GitHub Secrets
- Only accessible during workflow execution
- Server access is still protected by the key

---

**After regenerating the key without passphrase, your deployment should work!** 🚀

