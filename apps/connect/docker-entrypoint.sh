#!/bin/bash

# Install packages if provided
if [ ! -z "$PH_PACKAGES" ]; then
    IFS="," read -ra PACKAGES <<< "$PH_PACKAGES"
    for package in "${PACKAGES[@]}"; do
        ph install "$package"
    done
fi

# Build connect
ph connect build --base ${PH_CONNECT_BASE_PATH:-"/"}

# Move build to nginx directory
rm -rf /var/www/html/project
mkdir -p /var/www/html/project
cp -r .ph/connect-build/dist/* /var/www/html/project/

# Stop any existing nginx process
nginx -s stop 2>/dev/null || true

# Substitute environment variables in nginx configuration
envsubst '${PORT},${PH_CONNECT_BASE_PATH}' < /etc/nginx/nginx.conf > /etc/nginx/nginx.conf.tmp
mv /etc/nginx/nginx.conf.tmp /etc/nginx/nginx.conf

cat /etc/nginx/nginx.conf

echo "Testing nginx configuration..."
nginx -t

if [ $? -eq 0 ]; then
    echo "Nginx configuration test passed. Starting nginx..."
    # Start nginx
    nginx -g "daemon off;"
else
    echo "Nginx configuration test failed. Please check your configuration."
    exit 1
fi 
