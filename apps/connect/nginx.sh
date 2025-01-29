#!/bin/sh

# Execute vite-envs.sh
/usr/share/nginx/html/vite-envs.sh

# Prepare nginx config
envsubst '$PORT,$BASE_PATH' < /etc/nginx/conf.d/default.conf.template > /etc/nginx/conf.d/default.conf

# Start Nginx
nginx -g 'daemon off;'