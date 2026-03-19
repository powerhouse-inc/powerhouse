#!/usr/bin/env bash
set -euo pipefail

mkdir -p ./storage
npx verdaccio --config ./verdaccio.config.yaml --listen 4873