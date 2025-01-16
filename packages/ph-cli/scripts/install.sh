#!/bin/bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.34.0/install.sh | bash
. ~/.nvm/nvm.sh
nvm --version
nvm install 20
npm install -g pnpm
pnpm setup
pnpm install -g ph-cmd pm2
OUTPUT=$(pm2 startup | tail -n 1)
eval $OUTPUT
