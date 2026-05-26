#!/bin/bash
# 服务器一次性初始化脚本，需以 root 身份执行
# 用法：bash deploy/scripts/setup-server.sh
set -e

DOMAIN="api-task.aitrealmaker.top"
EMAIL="eee1490581303@gmail.com"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
NGINX_CONF_SRC="$SCRIPT_DIR/../nginx/$DOMAIN.conf"
NGINX_CONF_DEST="/etc/nginx/sites-available/$DOMAIN"

echo "==> 安装 Nginx 和 Certbot..."
apt-get update -y
apt-get install -y nginx certbot python3-certbot-nginx

echo "==> 配置临时 HTTP 站点用于证书申请..."
cat > "$NGINX_CONF_DEST" <<EOF
server {
    listen 80;
    server_name $DOMAIN;
}
EOF

ln -sf "$NGINX_CONF_DEST" /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default

nginx -t
systemctl enable nginx
systemctl reload nginx

echo "==> 申请 SSL 证书..."
certbot certonly --nginx \
    -d "$DOMAIN" \
    --email "$EMAIL" \
    --agree-tos \
    --non-interactive

echo "==> 部署最终 Nginx 配置..."
cp "$NGINX_CONF_SRC" "$NGINX_CONF_DEST"
nginx -t
systemctl reload nginx

echo "==> 验证自动续签定时器..."
systemctl enable certbot.timer
systemctl start certbot.timer
systemctl status certbot.timer --no-pager

echo ""
echo "✅ 初始化完成！"
echo "   HTTPS: https://$DOMAIN"
