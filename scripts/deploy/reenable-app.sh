#!/bin/bash
read -p "Service name: " SVC
read -p "Nginx site name: " SITE
sudo ln -sf /etc/nginx/sites-available/$SITE /etc/nginx/sites-enabled/$SITE
sudo systemctl enable "$SVC"
sudo systemctl start "$SVC"
sudo nginx -t && sudo systemctl reload nginx
