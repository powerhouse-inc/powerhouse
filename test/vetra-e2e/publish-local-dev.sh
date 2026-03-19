#!/usr/bin/env bash
set -euo pipefail

pnpm --filter "./packages/*" exec pnpm version prerelease --preid dev --no-git-tag-version
pnpm --filter "./packages/*" publish --registry http://localhost:4873 --tag dev --no-git-checks