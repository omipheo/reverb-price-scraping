#!/bin/bash

# Initial server setup script
# Run this once on a fresh Ubuntu server

set -e

echo "🔧 Setting up Ubuntu server for deployment..."

# Update system
echo "📦 Updating system packages..."
sudo apt-get update
sudo apt-get upgrade -y

# Install Node.js 18.x
echo "📦 Installing Node.js..."
if ! command -v node &> /dev/null; then
    curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
    sudo apt-get install -y nodejs
else
    echo "Node.js already installed: $(node --version)"
fi

# Install Git
echo "📦 Installing Git..."
sudo apt-get install -y git

# Install PM2
echo "📦 Installing PM2..."
if ! command -v pm2 &> /dev/null; then
    sudo npm install -g pm2
else
    echo "PM2 already installed"
fi

# Install MongoDB (optional - uncomment if needed)
# echo "📦 Installing MongoDB..."
# wget -qO - https://www.mongodb.org/static/pgp/server-6.0.asc | sudo apt-key add -
# echo "deb [ arch=amd64,arm64 ] https://repo.mongodb.org/apt/ubuntu focal/mongodb-org/6.0 multiverse" | sudo tee /etc/apt/sources.list.d/mongodb-org-6.0.list
# sudo apt-get update
# sudo apt-get install -y mongodb-org
# sudo systemctl start mongod
# sudo systemctl enable mongod

# Create deployment directory
echo "📁 Creating deployment directory..."
DEPLOY_PATH="/var/www/price-scraping"
sudo mkdir -p "$DEPLOY_PATH"
sudo chown $USER:$USER "$DEPLOY_PATH"

# Setup firewall
echo "🔥 Configuring firewall..."
sudo ufw allow 22/tcp   # SSH
sudo ufw allow 80/tcp   # HTTP
sudo ufw allow 443/tcp  # HTTPS
echo "y" | sudo ufw enable

# Generate SSH key for GitHub Actions
echo "🔑 Generating SSH key for GitHub Actions..."
if [ ! -f ~/.ssh/github_actions ]; then
    ssh-keygen -t ed25519 -C "github-actions" -f ~/.ssh/github_actions -N ""
    cat ~/.ssh/github_actions.pub >> ~/.ssh/authorized_keys
    chmod 600 ~/.ssh/authorized_keys
    echo "✅ SSH key generated!"
    echo ""
    echo "📋 Add this private key to GitHub Secrets (SSH_PRIVATE_KEY):"
    echo "---"
    cat ~/.ssh/github_actions
    echo "---"
else
    echo "SSH key already exists"
fi

# Setup PM2 startup
echo "🚀 Setting up PM2 startup..."
pm2 startup | grep -v "PM2" | bash || echo "PM2 startup already configured"

echo ""
echo "✅ Server setup completed!"
echo ""
echo "Next steps:"
echo "1. Clone your repository: cd $DEPLOY_PATH && git clone <your-repo-url> ."
echo "2. Create .env file with your environment variables"
echo "3. Run: npm ci --production"
echo "4. Start application: pm2 start ecosystem.config.js"
echo "5. Save PM2: pm2 save"

