#!/usr/bin/env bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.34.0/install.sh | bash
\. ~/.nvm/nvm.sh
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"  # This loads nvm
[ -s "$NVM_DIR/bash_completion" ] && \. "$NVM_DIR/bash_completion"  # This loads nvm bash_completion
nvm --version
nvm install 20
curl -fsSL https://get.pnpm.io/install.sh | sh -
export PNPM_HOME="/home/$USER/.local/share/pnpm"
export PATH="$PNPM_HOME:$PATH"
pnpm install -g ph-cmd
echo ""
echo "  🎉 Setup Complete! 🎉"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  To complete installation:"
echo "  1. Restart your terminal"
echo "     OR"
echo "     Run: source ~/.bashrc"
echo ""
echo "  2. Start using Powerhouse by typing:"
echo "     ph"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""