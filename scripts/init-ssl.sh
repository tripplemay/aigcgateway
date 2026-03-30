#!/bin/bash
set -euo pipefail

# -----------------------------------------------------------
# First-time SSL certificate setup for AIGC Gateway
#
# Prerequisites:
#   - DNS A records for all 3 domains pointing to this VPS
#   - Ports 80/443 open
#   - Docker and docker compose installed
#
# Usage:
#   chmod +x scripts/init-ssl.sh
#   sudo ./scripts/init-ssl.sh
# -----------------------------------------------------------

DOMAINS="aigc.guangai.ai api.aigc.guangai.ai cdn.aigc.guangai.ai"
EMAIL="admin@guangai.ai"
COMPOSE_FILE="docker-compose.production.yml"
DATA_DIR="./certbot"

echo "=== AIGC Gateway SSL Setup ==="
echo "Domains: $DOMAINS"
echo "Email:   $EMAIL"
echo ""

# Step 1: Create required directories
echo "[1/5] Creating directories..."
mkdir -p "$DATA_DIR/conf" "$DATA_DIR/www"

# Step 2: Download recommended TLS parameters (if not exist)
if [ ! -f "$DATA_DIR/conf/options-ssl-nginx.conf" ]; then
    echo "[2/5] Downloading TLS parameters..."
    curl -sf https://raw.githubusercontent.com/certbot/certbot/main/certbot-nginx/certbot_nginx/_internal/tls_configs/options-ssl-nginx.conf \
        -o "$DATA_DIR/conf/options-ssl-nginx.conf"
    curl -sf https://raw.githubusercontent.com/certbot/certbot/main/certbot/certbot/ssl-dhparams.pem \
        -o "$DATA_DIR/conf/ssl-dhparams.pem"
else
    echo "[2/5] TLS parameters already exist, skipping."
fi

# Step 3: Create dummy certificate so nginx can start
echo "[3/5] Creating temporary self-signed certificate..."
CERT_DIR="$DATA_DIR/conf/live/aigc.guangai.ai"
mkdir -p "$CERT_DIR"
if [ ! -f "$CERT_DIR/fullchain.pem" ]; then
    openssl req -x509 -nodes -newkey rsa:2048 -days 1 \
        -keyout "$CERT_DIR/privkey.pem" \
        -out "$CERT_DIR/fullchain.pem" \
        -subj "/CN=localhost" 2>/dev/null
fi

# Step 4: Start nginx with dummy cert
echo "[4/5] Starting nginx..."
docker compose -f "$COMPOSE_FILE" up -d nginx
sleep 2

# Step 5: Request real certificate from Let's Encrypt
echo "[5/5] Requesting Let's Encrypt certificate..."
DOMAIN_ARGS=""
for d in $DOMAINS; do
    DOMAIN_ARGS="$DOMAIN_ARGS -d $d"
done

docker compose -f "$COMPOSE_FILE" run --rm certbot certonly \
    --webroot \
    --webroot-path=/var/www/certbot \
    --email "$EMAIL" \
    --agree-tos \
    --no-eff-email \
    --force-renewal \
    $DOMAIN_ARGS

# Reload nginx with real certificate
echo ""
echo "Reloading nginx with real certificate..."
docker compose -f "$COMPOSE_FILE" exec nginx nginx -s reload

echo ""
echo "=== SSL Setup Complete ==="
echo "Certificates installed for: $DOMAINS"
echo "Auto-renewal is handled by the certbot service."
echo ""
echo "Next steps:"
echo "  docker compose -f $COMPOSE_FILE up -d"
