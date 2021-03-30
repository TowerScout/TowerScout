sudo cp towerscout.service /etc/systemd/system
sudo systemctl daemon-reload
sudo systemctl start towerscout
sudo systemctl enable towerscout

