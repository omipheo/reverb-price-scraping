# RSA SSH Key Setup for IONOS

Quick guide for generating RSA SSH keys for GitHub Actions deployment.

## 🔑 Generate RSA SSH Key

### On IONOS Server

```bash
# SSH into your IONOS server
ssh root@your-ionos-ip

# Generate RSA 4096-bit key pair
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

## 📋 Key Format

RSA private keys will look like:

```
-----BEGIN RSA PRIVATE KEY-----
MIIEpAIBAAKCAQEA... (many lines of base64)
-----END RSA PRIVATE KEY-----
```

Or newer format:

```
-----BEGIN OPENSSH PRIVATE KEY-----
b3BlbnNzaC1rZXktdjEAAAAABG5vbmUAAAAEbm9uZQAAAAAAAAABAAABlwAAAAdzc2gtcn
... (many lines)
-----END OPENSSH PRIVATE KEY-----
```

**Important:** Copy the ENTIRE key including BEGIN and END lines!

## ✅ Add to GitHub Secrets

1. Go to: Repository → Settings → Secrets → Actions
2. Add/Update `SSH_PRIVATE_KEY` secret
3. Paste the complete private key
4. Save

## 🧪 Test Connection

```bash
# Test locally (on your machine)
ssh -i ~/.ssh/github_actions root@your-ionos-ip

# Or test with the key file
ssh -i /path/to/github_actions root@your-ionos-ip
```

## 🔒 RSA vs Ed25519

**RSA 4096-bit:**
- ✅ Widely supported
- ✅ Compatible with older systems
- ✅ Good security (4096-bit)
- ⚠️ Larger key size

**Why RSA?**
- Better compatibility with some systems
- Required by some organizations
- Works with all SSH implementations

## 📝 Quick Command Reference

```bash
# Generate RSA key
ssh-keygen -t rsa -b 4096 -C "github-actions" -f ~/.ssh/github_actions -N ""

# View public key
cat ~/.ssh/github_actions.pub

# View private key
cat ~/.ssh/github_actions

# Test connection
ssh -i ~/.ssh/github_actions root@your-ionos-ip
```

---

**Your RSA SSH key is ready for CI/CD deployment!** 🔐

