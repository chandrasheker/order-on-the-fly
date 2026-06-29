#!/bin/bash
read -p "Service name: " SVC
sudo systemctl restart "$SVC"
sudo systemctl status "$SVC" --no-pager
