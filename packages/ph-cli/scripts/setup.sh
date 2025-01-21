#!/bin/bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.34.0/install.sh | bash
. ~/.nvm/nvm.sh
nvm --version
nvm install 20
source $HOME/.bashrc
npm install -g ph-cmd
