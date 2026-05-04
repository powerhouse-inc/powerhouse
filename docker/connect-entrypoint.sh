#!/bin/sh
set -e

# PH_CONNECT_BASE_PATH stays as-is for the catch-all `location ${VAR}` (so a
# subpath deploy at /connect still matches the bare /connect URL and falls
# through try_files to /index.html — preserves the prior behavior).
#
# PH_CONNECT_BASE_PREFIX is a derived var with the trailing slash stripped,
# used inside the prefixed locations like `${VAR}/assets/`. Without this,
# `${PH_CONNECT_BASE_PATH}/assets/` would render as `//assets/` at the
# default `/` base path and silently fail to match real /assets/ requests
# (causing custom Cache-Control / etag headers to be skipped).
#   "/"        -> ""         => location /assets/
#   "/connect" -> "/connect" => location /connect/assets/
#   "/connect/"-> "/connect"
PH_CONNECT_BASE_PATH="${PH_CONNECT_BASE_PATH:-/}"
PH_CONNECT_BASE_PREFIX="${PH_CONNECT_BASE_PATH%/}"
export PH_CONNECT_BASE_PATH PH_CONNECT_BASE_PREFIX

envsubst '${PORT},${PH_CONNECT_BASE_PATH},${PH_CONNECT_BASE_PREFIX}' < /etc/nginx/nginx.conf.template > /etc/nginx/nginx.conf

DIST_DIR="/var/www/html/project"
RUNTIME_FILE="${DIST_DIR}/powerhouse.config.json"

# Runtime URL override. Unset means keep the build-baked registryUrl from
# ph-packages.json (set at build time via PH_CONNECT_PACKAGES_REGISTRY).
RUNTIME_URL="${PH_PACKAGE_REGISTRY_URL:-${PH_REGISTRY_URL:-}}"

# Env -> powerhouse.config.json seeding (set-if-absent).
#
# See CONNECT-CONFIG.md §13 for design. Mapping mirrors
# packages/shared/connect/env-to-runtime-config.ts (ENV_SEEDING_RULES).
# Operator edits to the file always win — env vars only fill in missing fields.
#
# Implementation note: we write to a sibling tmp file then `cat tmp > file`
# (in-place truncate-and-write) instead of `mv tmp file`. `mv` would replace
# the inode and fails with "Resource busy" when the file is bind-mounted as
# a single file (the standard Kubernetes ConfigMap / Secret projection).
# `cat >` preserves the inode so it works through bind mounts. If the file
# is read-only the write fails loudly; that's the correct behavior because
# operator-managed configs should not be re-seeded by the entrypoint.
seed_path_if_absent() {
  PATH_JSON="$1"
  VALUE_JSON="$2"
  jq --argjson p "$PATH_JSON" --argjson v "$VALUE_JSON" '
    if (getpath($p) == null) then setpath($p; $v) else . end
  ' "$RUNTIME_FILE" > "${RUNTIME_FILE}.tmp"
  cat "${RUNTIME_FILE}.tmp" > "$RUNTIME_FILE"
  rm -f "${RUNTIME_FILE}.tmp"
}

warn_deprecated() {
  echo "[ph-config] $1 is deprecated; set the corresponding field in powerhouse.config.json instead. Used here only to seed the file." >&2
}

if [ -f "$RUNTIME_FILE" ]; then
  # PH_CONNECT_DISABLE_ADD_DRIVE -> connect.drives.allowAddDrive (inverted)
  if [ -n "$PH_CONNECT_DISABLE_ADD_DRIVE" ]; then
    warn_deprecated "PH_CONNECT_DISABLE_ADD_DRIVE"
    case "$PH_CONNECT_DISABLE_ADD_DRIVE" in
      [Tt][Rr][Uu][Ee]) ALLOW_ADD_DRIVE="false" ;;
      *) ALLOW_ADD_DRIVE="true" ;;
    esac
    seed_path_if_absent '["connect","drives","allowAddDrive"]' "$ALLOW_ADD_DRIVE"
  fi

  # PH_CONNECT_DEFAULT_DRIVES_URL -> connect.drives.defaultDrives
  if [ -n "$PH_CONNECT_DEFAULT_DRIVES_URL" ]; then
    warn_deprecated "PH_CONNECT_DEFAULT_DRIVES_URL"
    DRIVES_JSON=$(printf '%s' "$PH_CONNECT_DEFAULT_DRIVES_URL" | jq -R -c '
      split(",")
      | map(gsub("^\\s+|\\s+$"; ""))
      | map(select(length > 0))
      | map({ url: ., name: null, icon: null })
    ')
    seed_path_if_absent '["connect","drives","defaultDrives"]' "$DRIVES_JSON"
  fi

  # PH_REGISTRY_PACKAGES -> packages[]
  # "pkg-a,@scope/pkg-b@1.0.0" -> [{packageName, version?, provider: "registry"}]
  if [ -n "$PH_REGISTRY_PACKAGES" ]; then
    warn_deprecated "PH_REGISTRY_PACKAGES"
    PACKAGES_JSON=$(printf '%s' "$PH_REGISTRY_PACKAGES" | jq -R -c '
      split(",")
      | map(gsub("^\\s+|\\s+$"; ""))
      | map(select(length > 0))
      | map(
          capture("^(?<packageName>(?:@[^/]+/)?[^@]+)(?:@(?<version>.+))?$")
          | if .version == null then
              { packageName, provider: "registry" }
            else
              { packageName, version, provider: "registry" }
            end
        )
    ')
    jq --argjson pkgs "$PACKAGES_JSON" '
      .schemaVersion = 2
      | if (.packages // []) == [] then .packages = $pkgs else . end
    ' "$RUNTIME_FILE" > "${RUNTIME_FILE}.tmp"
    cat "${RUNTIME_FILE}.tmp" > "$RUNTIME_FILE"
    rm -f "${RUNTIME_FILE}.tmp"
  fi
fi

echo "Testing nginx configuration..."
nginx -t

if [ $? -eq 0 ]; then
    echo "Connect available at: http://localhost:${PORT}${PH_CONNECT_BASE_PATH}"
    exec nginx -g "daemon off;"
else
    echo "Nginx configuration test failed"
    exit 1
fi
