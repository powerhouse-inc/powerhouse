#!/usr/bin/env bash
# Install the newest staging build of ph.
#
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/powerhouse-inc/powerhouse/main/scripts/install-binary.staging.sh | bash
#
# Honors PH_INSTALL_DIR, PH_REPO, and GITHUB_TOKEN like the main installer.
# Set PH_VERSION to override the channel default ("staging").

set -euo pipefail

export PH_VERSION="${PH_VERSION:-staging}"
export PH_INSTALL_DIR PH_REPO GITHUB_TOKEN

curl -fsSL "https://raw.githubusercontent.com/${PH_REPO:-powerhouse-inc/powerhouse}/main/scripts/install-binary.sh" | bash
