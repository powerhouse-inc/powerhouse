#!/bin/sh
set -e

# Substitute environment variables in nginx configuration
envsubst '${PORT},${PH_CONNECT_BASE_PATH}' < /etc/nginx/nginx.conf.template > /etc/nginx/nginx.conf

echo "Testing nginx configuration..."
nginx -t

if [ $? -eq 0 ]; then
    echo "Connect available at: http://localhost:${PORT}${PH_CONNECT_BASE_PATH}"
    exec nginx -g "daemon off;"
else
    echo "Nginx configuration test failed"
    exit 1
fi
