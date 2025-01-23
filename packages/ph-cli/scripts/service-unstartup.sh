sudo systemctl stop pm2-$USER
sudo systemctl disable pm2-$USER
OUTPUT=$(pm2 unstartup | tail -n 1)
eval $OUTPUT
sudo systemctl daemon-reload