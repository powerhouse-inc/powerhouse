OUTPUT=$(pm2 startup | tail -n 1)
eval $OUTPUT
ps aux | grep pm2 | grep -v grep | awk '{print $2}' | xargs kill -9 > /dev/null 2>&1
sudo systemctl daemon-reload
sudo systemctl enable pm2-$USER
sudo systemctl start pm2-$USER
