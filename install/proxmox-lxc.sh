#!/usr/bin/env bash
set -e

REPO="https://github.com/cpeneguy/BookBridge.git"

read -p "Container ID [118]: " CTID
CTID=${CTID:-118}

read -p "Hostname [bookbridge]: " HOSTNAME
HOSTNAME=${HOSTNAME:-bookbridge}

read -p "Disk size in GB [8]: " DISK_SIZE
DISK_SIZE=${DISK_SIZE:-8}

read -p "Memory in MB [1024]: " MEMORY
MEMORY=${MEMORY:-1024}

read -p "CPU cores [1]: " CORES
CORES=${CORES:-1}

read -p "Mount media path? Host path [/mnt/media]: " MEDIA_HOST
MEDIA_HOST=${MEDIA_HOST:-/mnt/media}

TEMPLATE=$(pveam list local | awk '/debian-12.*standard.*amd64/ {print $1}' | tail -n 1)

if [ -z "$TEMPLATE" ]; then
  echo "No Debian 12 template found."
  echo "Download one in Proxmox: local → CT Templates → Templates → debian-12-standard"
  exit 1
fi

echo "Using template: $TEMPLATE"

pct create "$CTID" "$TEMPLATE" \
  --hostname "$HOSTNAME" \
  --storage local-lvm \
  --rootfs local-lvm:"$DISK_SIZE" \
  --memory "$MEMORY" \
  --swap 512 \
  --cores "$CORES" \
  --net0 name=eth0,bridge=vmbr0,ip=dhcp,type=veth \
  --features nesting=1 \
  --unprivileged 1 \
  --password changeme

if [ -d "$MEDIA_HOST" ]; then
  pct set "$CTID" -mp0 "$MEDIA_HOST",mp=/mnt/media
fi

pct start "$CTID"
sleep 10

pct exec "$CTID" -- bash -c "
apt update
apt install -y curl git ca-certificates nano
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs
"

pct exec "$CTID" -- bash -c "
rm -rf /opt/bookbridge
git clone $REPO /opt/bookbridge
cd /opt/bookbridge
npm install
npx prisma generate || true
npx prisma migrate deploy || true
npm run build
"

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
Environment=PORT=8181

[Install]
WantedBy=multi-user.target
EOF"

pct exec "$CTID" -- systemctl daemon-reload
pct exec "$CTID" -- systemctl enable --now bookbridge

IP=$(pct exec "$CTID" -- hostname -I | awk '{print $1}')

echo ""
echo "BookBridge installed."
echo "Open: http://$IP:8181"
