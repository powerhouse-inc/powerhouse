#!/bin/sh
set -e

envsubst '${PORT},${PH_CONNECT_BASE_PATH}' < /etc/nginx/nginx.conf.template > /etc/nginx/nginx.conf

JSON_FILE="/var/www/html/project/ph-packages.json"

# Runtime URL override. Unset means keep the build-baked registryUrl from
# ph-packages.json (set at build time via PH_CONNECT_PACKAGES_REGISTRY).
RUNTIME_URL="${PH_PACKAGE_REGISTRY_URL:-${PH_REGISTRY_URL:-}}"

# Write powerhouse.config.json from PH_REGISTRY_PACKAGES env var if set
if [ -n "$PH_REGISTRY_PACKAGES" ]; then
  # Convert comma-separated string to JSON array
  JSON_ARRAY=$(echo "$PH_REGISTRY_PACKAGES" | tr ',' '\n' | sed 's/.*/"&"/' | paste -sd ',' - | sed 's/^/[/;s/$/]/')
  echo "{\"schemaVersion\":1,\"packages\":${JSON_ARRAY},\"localPackage\":null}" > "${DIST_DIR}/powerhouse.config.json"
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
