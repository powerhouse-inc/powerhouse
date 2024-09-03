#!/bin/sh

envsubst '$PORT,$BASE_PATH' < /etc/nginx/conf.d/default.conf.template > /etc/nginx/conf.d/default.conf

cat /etc/nginx/conf.d/default.conf

nginx -t
