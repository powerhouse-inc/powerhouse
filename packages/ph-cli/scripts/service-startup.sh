OUTPUT=$(pm2 startup | tail -n 1)
eval $OUTPUT
sudo systemctl enable pm2-$USER
sudo systemctl start pm2-$USER