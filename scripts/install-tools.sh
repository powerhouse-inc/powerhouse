#!/usr/bin/env bash

# Check and install nvm if not present
if ! command -v nvm &> /dev/null; then
    echo "Installing nvm..."
    curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.34.0/install.sh | bash
    export NVM_DIR="$HOME/.nvm"
    [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"  # This loads nvm
    [ -s "$NVM_DIR/bash_completion" ] && \. "$NVM_DIR/bash_completion"  # This loads nvm bash_completion
else
    echo "nvm is already installed"
    export NVM_DIR="$HOME/.nvm"
    [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
    [ -s "$NVM_DIR/bash_completion" ] && \. "$NVM_DIR/bash_completion"
fi

# Check and install Node.js if not present
if ! command -v node &> /dev/null; then
    echo "Installing Node.js..."
    nvm install 22
else
    echo "Node.js is already installed: $(node --version)"
fi

# Check and install pnpm if not present
if ! command -v pnpm &> /dev/null; then
    echo "Installing pnpm..."
    # Install pnpm using npm
    npm install -g pnpm
    # Set up pnpm environment
    export PNPM_HOME="$HOME/.local/share/pnpm"
    export PATH="$PNPM_HOME:$PATH"
else
    echo "pnpm is already installed: $(pnpm --version)"
    export PNPM_HOME="$HOME/.local/share/pnpm"
    export PATH="$PNPM_HOME:$PATH"
fi

# Verify pnpm is available
if ! command -v pnpm &> /dev/null; then
    echo "Error: pnpm installation failed"
    exit 1
fi

# Get available versions of ph-cmd
echo "Fetching available versions of ph-cmd..."
echo "Available versions of ph-cmd: dev, staging and latest"
read -p "Enter the version to install (dev/staging/latest) or press Enter for latest: " version_choice

if [ -z "$version_choice" ]; then
    # Install latest version
    echo "Installing latest version of ph-cmd..."
    pnpm add -g ph-cmd
else
    # Install selected version
    echo "Installing ph-cmd version $version_choice..."
    pnpm add -g ph-cmd@$version_choice
fi

# Set up environment variables in current shell
export PNPM_HOME="$HOME/.local/share/pnpm"
export PATH="$PNPM_HOME:$PATH"

# Add environment variables to shell config if not already present
SHELL_CONFIG="$HOME/.bashrc"
if [ -f "$HOME/.zshrc" ]; then
    SHELL_CONFIG="$HOME/.zshrc"
fi

# Add NVM configuration if not present
if ! grep -q "export NVM_DIR" "$SHELL_CONFIG"; then
    echo "
# NVM Configuration
export NVM_DIR=\"\$HOME/.nvm\"
[ -s \"\$NVM_DIR/nvm.sh\" ] && \. \"\$NVM_DIR/nvm.sh\"  # This loads nvm
[ -s \"\$NVM_DIR/bash_completion\" ] && \. \"\$NVM_DIR/bash_completion\"  # This loads nvm bash_completion" >> "$SHELL_CONFIG"
fi

# Add PNPM configuration if not present
if ! grep -q "export PNPM_HOME" "$SHELL_CONFIG"; then
    echo "
# PNPM Configuration
export PNPM_HOME=\"\$HOME/.local/share/pnpm\"
export PATH=\"\$PNPM_HOME:\$PATH\"" >> "$SHELL_CONFIG"
fi

# Verify ph command is available
if ! command -v ph &> /dev/null; then
    echo "Error: ph command not found after installation"
    echo "Please try running: source $SHELL_CONFIG"
    exit 1
fi

ph setup-globals --$version_choice

echo ""
echo "  🎉 Setup Complete! 🎉"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Please try running: source $SHELL_CONFIG"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Afterwards you can use Powerhouse by typing:"
echo "  ph version"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""