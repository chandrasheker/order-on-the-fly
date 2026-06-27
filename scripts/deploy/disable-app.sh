#!/bin/bash
read -p "Service name: " SVC
read -p "Nginx site name: " SITE
sudo systemctl stop "$SVC"
sudo systemctl disable "$SVC"
[ -L /etc/nginx/sites-enabled/$SITE ] && sudo rm /etc/nginx/sites-enabled/$SITE
sudo nginx -t && sudo systemctl reload nginx
