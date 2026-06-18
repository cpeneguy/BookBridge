#!/usr/bin/env bash
set -e

CTID=118
HOSTNAME="bookbridge"
REPO="https://github.com/cpeneguy/BookBridge.git"
TEMPLATE="local:vztmpl/debian-12-standard_12.7-1_amd64.tar.zst"
STORAGE="local-lvm"
DISK_SIZE="8"
MEMORY="1024"
SWAP="512"
CORES="1"
BRIDGE="vmbr0"
MEDIA_HOST="/mnt/media"
MEDIA_CT="/mnt/media"
APP_DIR="/opt/bookbridge"
PORT="3000"

echo "Creating BookBridge LXC..."

pct create "$CTID" "$TEMPLATE" \
  --hostname "$HOSTNAME" \
  --storage "$STORAGE" \
  --rootfs "$STORAGE:$DISK_SIZE" \
  --memory "$MEMORY" \
  --swap "$SWAP" \
  --cores "$CORES" \
  --net0 name=eth0,bridge="$BRIDGE",ip=dhcp,type=veth \
  --features nesting=1 \
  --unprivileged 1 \
  --password changeme

echo "Mounting media folder..."
pct set "$CTID" -mp0 "$MEDIA_HOST",mp="$MEDIA_CT"

echo "Starting container..."
pct start "$CTID"

echo "Waiting for container network..."
sleep 10

echo "Installing dependencies..."
pct exec "$CTID" -- bash -c "
apt update
apt install -y curl git nano ca-certificates
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs
node -v
npm -v
"

echo "Cloning BookBridge..."
pct exec "$CTID" -- bash -c "
rm -rf $APP_DIR
git clone $REPO $APP_DIR
cd $APP_DIR
npm install
npx prisma generate || true
npx prisma migrate deploy || true
npm run build
"

echo "Creating systemd service..."
pct exec "$CTID" -- bash -c "cat > /etc/systemd/system/bookbridge.service <<'EOF'
[Unit]
Description=BookBridge
After=network.target

[Service]
Type=simple
WorkingDirectory=/opt/bookbridge
ExecStart=/usr/bin/npm start
Restart=always
RestartSec=5
Environment=NODE_ENV=production
Environment=PORT=3000

[Install]
WantedBy=multi-user.target
EOF"

pct exec "$CTID" -- systemctl daemon-reload
pct exec "$CTID" -- systemctl enable --now bookbridge

echo "BookBridge install complete."
echo "Container ID: $CTID"
echo "Find IP with:"
echo "pct exec $CTID -- hostname -I"
echo "Then open:"
echo "http://<container-ip>:$PORT"
