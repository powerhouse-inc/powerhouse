#!/bin/sh
set -e
envsubst '${PORT} ${PH_CONNECT_BASE_PATH}' < /etc/nginx/nginx.conf.template > /etc/nginx/nginx.conf
nginx -t
echo "Connect serving at http://localhost:${PORT}${PH_CONNECT_BASE_PATH}"
exec nginx -g "daemon off;"
