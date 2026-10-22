#!/usr/bin/env bash
# Install and build the workspace, or only the projects matched by pnpm selectors.
# Usage: install-and-build.sh [--no-build] [selector...]   e.g. "@powerhousedao/reactor..."
set -euo pipefail

build=true
if [[ "${1:-}" == "--no-build" ]]; then
  build=false
  shift
fi

if [[ $# -eq 0 ]]; then
  pnpm install-ci
  if $build; then
    pnpm build
    pnpm rebuild --recursive
    pnpm --filter=@powerhousedao/versioned-documents --no-bail run build
  fi
  exit 0
fi

filters=()
for selector in "$@"; do filters+=("--filter=$selector"); done

# pnpm always installs the root importer too, so root tools (oxlint, tsx, ...) stay available.
pnpm install --frozen-lockfile "${filters[@]}"
$build || exit 0

# Build what `pnpm build` would build, restricted to the selected projects.
# node, not jq: the node:24 container images ship without jq.
selected=$(pnpm ls -r --depth -1 --json "${filters[@]}" |
  node -e 'for (const p of JSON.parse(require("fs").readFileSync(0, "utf8"))) console.log(p.name)')
build_filters=()
for name in $(node -p 'require("./package.json").scripts.build' | grep -o -- '--filter=[^ ]*' | cut -d= -f2); do
  if grep -qxF -- "$name" <<<"$selected"; then build_filters+=("--filter=$name"); fi
done
if [[ ${#build_filters[@]} -gt 0 ]]; then
  # The root `build` script runs this first; a filtered build bypasses it.
  # Without the .tsbuild outputs, dist declarations emit cross-package types
  # as `any` (see the script).
  # shellcheck disable=SC2086 # one package name per word
  node scripts/build-declarations.mjs $selected
  pnpm "${build_filters[@]}" --no-bail run build
fi

pnpm rebuild --recursive "${filters[@]}"

if grep -qxF -- "@powerhousedao/versioned-documents" <<<"$selected"; then
  pnpm --filter=@powerhousedao/versioned-documents --no-bail run build
fi
