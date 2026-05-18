#!/bin/sh
set -e

envsubst '${PORT},${PH_CONNECT_BASE_PATH}' < /etc/nginx/nginx.conf.template > /etc/nginx/nginx.conf

JSON_FILE="/var/www/html/project/ph-packages.json"

# Runtime URL override. Unset means keep the build-baked registryUrl from
# ph-packages.json (set at build time via PH_CONNECT_PACKAGES_REGISTRY).
RUNTIME_URL="${PH_PACKAGE_REGISTRY_URL:-${PH_REGISTRY_URL:-}}"

# Merge runtime overrides into ph-packages.json — never overwrite, so
# build-baked fields (localPackage, registryUrl when not overridden) survive.
if [ -n "$PH_REGISTRY_PACKAGES" ] || [ -n "$RUNTIME_URL" ]; then
  [ -f "$JSON_FILE" ] || echo '{"packages":[],"localPackage":null,"registryUrl":null}' > "$JSON_FILE"

  JQ_EXPR='.'
  [ -n "$PH_REGISTRY_PACKAGES" ] && JQ_EXPR="${JQ_EXPR} | .packages = (\$pkgs | split(\",\"))"
  [ -n "$RUNTIME_URL" ] && JQ_EXPR="${JQ_EXPR} | .registryUrl = \$url"

  TMP=$(mktemp)
  jq --arg pkgs "$PH_REGISTRY_PACKAGES" --arg url "$RUNTIME_URL" "$JQ_EXPR" "$JSON_FILE" > "$TMP"
  mv "$TMP" "$JSON_FILE"
  # mktemp creates the temp file mode 0600 and `mv` preserves it. Force
  # world-readable so nginx workers can read it even if the pod runs as a
  # uid different from the file owner.
  chmod 644 "$JSON_FILE"
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
