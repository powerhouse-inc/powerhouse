#!/usr/bin/env bash
# Install ph (the Powerhouse CLI) as a single self-contained binary.
#
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/powerhouse-inc/powerhouse/main/scripts/install-binary.sh | bash
#
# Environment:
#   PH_INSTALL_DIR  Override install directory (default: $HOME/.local/bin)
#   PH_VERSION      Release to install (default: latest). Accepts:
#                     - "latest"  → newest stable release
#                     - "staging" → newest tag matching v*-staging.*
#                     - "dev"     → newest tag matching v*-dev.*
#                     - a literal tag, e.g. v6.0.0-dev.237
#   PH_REPO         GitHub repo slug (default: powerhouse-inc/powerhouse)

set -euo pipefail

REPO="${PH_REPO:-powerhouse-inc/powerhouse}"
INSTALL_DIR="${PH_INSTALL_DIR:-$HOME/.local/bin}"
VERSION="${PH_VERSION:-latest}"

err() { printf '\033[31merror:\033[0m %s\n' "$*" >&2; exit 1; }
info() { printf '\033[32m▶\033[0m %s\n' "$*"; }

need() { command -v "$1" >/dev/null 2>&1 || err "missing required command: $1"; }
need curl
need uname
need mktemp

case "$(uname -s)" in
  Darwin) os="darwin" ;;
  Linux)  os="linux" ;;
  MINGW*|MSYS*|CYGWIN*) os="windows" ;;
  *) err "unsupported OS: $(uname -s). Install ph-cmd via npm: 'npm i -g ph-cmd'." ;;
esac

case "$(uname -m)" in
  x86_64|amd64) arch="x64" ;;
  arm64|aarch64) arch="arm64" ;;
  *) err "unsupported architecture: $(uname -m). Install ph-cmd via npm: 'npm i -g ph-cmd'." ;;
esac

ext=""
[ "$os" = "windows" ] && ext=".exe"
asset="ph-${os}-${arch}${ext}"

# Resolve release tag → asset URLs via the GitHub API.
api_base="https://api.github.com/repos/${REPO}/releases"
case "$VERSION" in
  latest)
    release_url="${api_base}/latest"
    ;;
  staging|dev)
    # GitHub's /latest endpoint excludes prereleases, so list all releases
    # (newest first) and pick the first tag matching the channel pattern.
    info "Resolving newest '$VERSION' release"
    list_json=$(curl -fsSL \
      -H "Accept: application/vnd.github+json" \
      -H "X-GitHub-Api-Version: 2022-11-28" \
      ${GITHUB_TOKEN:+-H "Authorization: Bearer $GITHUB_TOKEN"} \
      "${api_base}?per_page=100") || err "failed to list releases"

    resolved_tag=$(printf '%s' "$list_json" \
      | tr ',' '\n' \
      | sed -n 's/.*"tag_name": *"\([^"]*\)".*/\1/p' \
      | grep -E "^v[0-9]+\.[0-9]+\.[0-9]+-${VERSION}\." \
      | head -1)

    [ -n "$resolved_tag" ] || err "no '$VERSION' release found in last 100 releases"
    info "Resolved $VERSION → $resolved_tag"
    release_url="${api_base}/tags/${resolved_tag}"
    ;;
  *)
    release_url="${api_base}/tags/${VERSION}"
    ;;
esac

info "Querying release: ${release_url}"
release_json=$(curl -fsSL \
  -H "Accept: application/vnd.github+json" \
  -H "X-GitHub-Api-Version: 2022-11-28" \
  ${GITHUB_TOKEN:+-H "Authorization: Bearer $GITHUB_TOKEN"} \
  "$release_url") || err "failed to query release info for '$VERSION'"

tag=$(printf '%s' "$release_json" | sed -n 's/.*"tag_name": *"\([^"]*\)".*/\1/p' | head -1)
[ -n "$tag" ] || err "could not parse release tag from API response"

# Extract asset URLs without requiring jq.
asset_url=$(printf '%s' "$release_json" \
  | tr ',' '\n' \
  | sed -n "s/.*\"browser_download_url\": *\"\\([^\"]*\\/${asset}\\)\".*/\\1/p" \
  | head -1)
checksums_url=$(printf '%s' "$release_json" \
  | tr ',' '\n' \
  | sed -n 's/.*"browser_download_url": *"\([^"]*\/checksums.txt\)".*/\1/p' \
  | head -1)

[ -n "$asset_url" ] || err "release '$tag' has no asset named '${asset}'"

tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT

info "Downloading ${asset} from ${tag}"
curl -fsSL --progress-bar -o "$tmp/$asset" "$asset_url"

if [ -n "$checksums_url" ]; then
  info "Verifying SHA256"
  curl -fsSL -o "$tmp/checksums.txt" "$checksums_url"
  expected=$(awk -v a="$asset" '$2 == a { print $1 }' "$tmp/checksums.txt")
  if [ -z "$expected" ]; then
    err "checksum for ${asset} not found in checksums.txt"
  fi
  if command -v sha256sum >/dev/null 2>&1; then
    actual=$(sha256sum "$tmp/$asset" | awk '{print $1}')
  else
    # macOS: shasum is preinstalled.
    actual=$(shasum -a 256 "$tmp/$asset" | awk '{print $1}')
  fi
  [ "$actual" = "$expected" ] || err "checksum mismatch (expected $expected, got $actual)"
else
  info "No checksums.txt published with this release — skipping verification"
fi

mkdir -p "$INSTALL_DIR"
install_path="$INSTALL_DIR/ph${ext}"
mv "$tmp/$asset" "$install_path"
chmod +x "$install_path"

# macOS quarantines downloads. Clear it so Gatekeeper doesn't refuse to run
# an unsigned binary. Real Developer ID signing is the long-term fix.
if [ "$os" = "darwin" ] && command -v xattr >/dev/null 2>&1; then
  xattr -d com.apple.quarantine "$install_path" 2>/dev/null || true
fi

info "Installed: $install_path ($tag)"

# Path hint.
case ":$PATH:" in
  *":$INSTALL_DIR:"*) ;;
  *)
    cat <<EOF

$INSTALL_DIR is not on your PATH. Add it by appending this line to your shell config:

  export PATH="$INSTALL_DIR:\$PATH"

Then reload your shell, or run: source ~/.bashrc  (or ~/.zshrc)
EOF
    ;;
esac

echo
echo "Run \`ph --help\` to get started, or \`ph init <project-name>\` to create a new Powerhouse project."
