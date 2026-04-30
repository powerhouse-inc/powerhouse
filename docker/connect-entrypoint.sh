#!/bin/sh
set -e

envsubst '${PORT},${PH_CONNECT_BASE_PATH}' < /etc/nginx/nginx.conf.template > /etc/nginx/nginx.conf

DIST_DIR="/var/www/html/project"

# Resolve registry URL: PH_PACKAGE_REGISTRY_URL > PH_REGISTRY_URL > default
export PH_PACKAGE_REGISTRY_URL="${PH_PACKAGE_REGISTRY_URL:-${PH_REGISTRY_URL:-https://registry.dev.vetra.io}}"

# Merge powerhouse.config.json from PH_REGISTRY_PACKAGES env var if set
if [ -n "$PH_REGISTRY_PACKAGES" ]; then
  RUNTIME_FILE="${DIST_DIR}/powerhouse.config.json"
  # Convert "pkg-a,@scope/pkg-b@1.0.0" -> [{packageName, version?, provider: "registry"}, ...]
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
  jq --argjson pkgs "$PACKAGES_JSON" \
    '.schemaVersion = 2 | .packages = $pkgs' \
    "$RUNTIME_FILE" > "${RUNTIME_FILE}.tmp" && mv "${RUNTIME_FILE}.tmp" "$RUNTIME_FILE"
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
