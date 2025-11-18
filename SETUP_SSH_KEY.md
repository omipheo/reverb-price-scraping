# Setup SSH Key for GitHub Actions on IONOS Server

Based on your server, here's how to set up the SSH key for CI/CD.

## 🔍 Current Situation

You have:
- `id_rsa` / `id_rsa.pub` - Existing SSH keys (probably for your personal access)
- `price-scraping` - Your deployment directory

## ✅ Option 1: Generate New Key for GitHub Actions (Recommended)

Create a separate key specifically for GitHub Actions:

```bash
# Generate new key for GitHub Actions
ssh-keygen -t rsa -b 4096 -C "github-actions" -f ~/.ssh/github_actions -N ""

# When prompted for passphrase, just press Enter twice (no passphrase)

# Add public key to authorized_keys
cat ~/.ssh/github_actions.pub >> ~/.ssh/authorized_keys

# Set correct permissions
chmod 700 ~/.ssh
chmod 600 ~/.ssh/authorized_keys
chmod 600 ~/.ssh/github_actions

# Display the PRIVATE key (COPY THIS!)
echo "=== COPY FROM HERE ==="
cat ~/.ssh/github_actions
echo "=== TO HERE ==="
```

Then add this private key to GitHub Secrets as `REVERB_SSH`.

## ✅ Option 2: Use Existing id_rsa Key

If your existing `id_rsa` key has NO passphrase, you can use it:

```bash
# Check if id_rsa has a passphrase
ssh-keygen -y -f ~/.ssh/id_rsa

# If it shows the public key immediately (no password prompt), it has no passphrase ✅
# If it prompts for password, it has a passphrase ❌

# If no passphrase, display the private key
cat ~/.ssh/id_rsa

# Make sure public key is in authorized_keys
cat ~/.ssh/id_rsa.pub >> ~/.ssh/authorized_keys
chmod 600 ~/.ssh/authorized_keys
```

Then add `~/.ssh/id_rsa` private key to GitHub Secrets as `REVERB_SSH`.

## ⚠️ Option 3: Remove Passphrase from Existing Key

If `id_rsa` has a passphrase, remove it:

```bash
# Remove passphrase from existing key
ssh-keygen -p -f ~/.ssh/id_rsa

# When prompted:
# Enter old passphrase: (enter current passphrase)
# Enter new passphrase: (press Enter - no passphrase)
# Enter same passphrase again: (press Enter)

# Verify no passphrase
ssh-keygen -y -f ~/.ssh/id_rsa

# Display private key
cat ~/.ssh/id_rsa
```

## 📋 Quick Setup Commands

**Recommended approach (new key for GitHub Actions):**

```bash
# 1. Generate new key
ssh-keygen -t rsa -b 4096 -C "github-actions" -f ~/.ssh/github_actions -N ""

# 2. Add to authorized_keys
cat ~/.ssh/github_actions.pub >> ~/.ssh/authorized_keys

# 3. Set permissions
chmod 700 ~/.ssh
chmod 600 ~/.ssh/authorized_keys ~/.ssh/github_actions

# 4. Display private key for GitHub
cat ~/.ssh/github_actions
```

## 🔐 Verify Setup

```bash
# Check key has no passphrase
ssh-keygen -y -f ~/.ssh/github_actions
# Should show public key immediately (no password prompt)

# Test connection locally
ssh -i ~/.ssh/github_actions root@localhost
# Should connect without password prompt
```

## 📝 Next Steps

1. Copy the private key output
2. Go to GitHub → Settings → Secrets → Actions
3. Add/Update `REVERB_SSH` secret with the private key
4. Run the workflow again

---

**After setting up the key, your CI/CD deployment will work!** 🚀

