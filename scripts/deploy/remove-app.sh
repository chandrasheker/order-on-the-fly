#!/bin/bash
read -p "Service name: " SVC
read -p "Nginx site name: " SITE
sudo systemctl stop "$SVC"
sudo systemctl disable "$SVC"
sudo rm -f /etc/systemd/system/$SVC.service
sudo systemctl daemon-reload
sudo rm -f /etc/nginx/sites-enabled/$SITE
sudo rm -f /etc/nginx/sites-available/$SITE
sudo nginx -t && sudo systemctl reload nginx
