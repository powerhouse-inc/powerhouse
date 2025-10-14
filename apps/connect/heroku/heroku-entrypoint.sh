#!/bin/bash

echo "Starting Connect on port ${PORT} with base path ${PH_CONNECT_BASE_PATH:-"/"}"

# Stop any existing nginx process
nginx -s stop 2>/dev/null || true

# Substitute both PORT and PH_CONNECT_BASE_PATH environment variables in nginx configuration
envsubst '${PORT} ${PH_CONNECT_BASE_PATH}' < /etc/nginx/nginx.conf.template > /etc/nginx/nginx.conf

echo "Testing nginx configuration..."
nginx -t

if [ $? -eq 0 ]; then
    echo "Connect is starting on port ${PORT}"
    # Start nginx in foreground
    exec nginx -g "daemon off;"
else
    echo "Nginx configuration test failed. Please check your configuration."
    cat /etc/nginx/nginx.conf
    exit 1
fi 
