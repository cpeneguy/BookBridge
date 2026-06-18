#!/usr/bin/env bash
set -e

REPO="https://github.com/cpeneguy/BookBridge.git"
APP_DIR="/opt/bookbridge"

read -p "Container ID [118]: " CTID
CTID=${CTID:-118}

read -p "Hostname [bookbridge]: " HOSTNAME
HOSTNAME=${HOSTNAME:-bookbridge}

read -p "BookBridge Port [8181]: " PORT
PORT=${PORT:-8181}

read -p "Disk size in GB [8]: " DISK_SIZE
DISK_SIZE=${DISK_SIZE:-8}

read -p "Memory in MB [1024]: " MEMORY
MEMORY=${MEMORY:-1024}

read -p "CPU cores [1]: " CORES
CORES=${CORES:-1}

read -p "Media host path [/mnt/media]: " MEDIA_HOST
MEDIA_HOST=${MEDIA_HOST:-/mnt/media}

if pct status "$CTID" >/dev/null 2>&1; then
  echo "Container ID $CTID already exists. Choose a different CTID."
  exit 1
fi

echo "Finding compatible container template..."

TEMPLATE=$(pveam list local | awk '
  /debian-12.*standard.*amd64/ {print $1; exit}
  /debian-13.*standard.*amd64/ {print $1; exit}
  /ubuntu-24.04.*standard.*amd64/ {print $1; exit}
')

if [ -z "$TEMPLATE" ]; then
  echo "No compatible local template found. Updating template list..."
  pveam update

  TEMPLATE_NAME=$(pveam available --section system | awk '
    /debian-12.*standard.*amd64/ {print $2; exit}
    /debian-13.*standard.*amd64/ {print $2; exit}
    /ubuntu-24.04.*standard.*amd64/ {print $2; exit}
  ')

  if [ -z "$TEMPLATE_NAME" ]; then
    echo "Could not find Debian 12, Debian 13, or Ubuntu 24.04 template."
    exit 1
  fi

  echo "Downloading template: $TEMPLATE_NAME"
  pveam download local "$TEMPLATE_NAME"
  TEMPLATE="local:vztmpl/$TEMPLATE_NAME"
fi

echo "Using template: $TEMPLATE"
echo "Creating BookBridge LXC..."

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
  echo "Mounting media path: $MEDIA_HOST"
  pct set "$CTID" -mp0 "$MEDIA_HOST",mp=/mnt/media
else
  echo "Media path not found, skipping mount: $MEDIA_HOST"
fi

echo "Starting container..."
pct start "$CTID"
sleep 10

echo "Installing dependencies..."
pct exec "$CTID" -- bash -c "
apt update
apt install -y curl git ca-certificates nano
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs
"

echo "Installing BookBridge..."
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
pct exec "$CTID" -- bash -c "cat > /etc/systemd/system/bookbridge.service <<EOF
[Unit]
Description=BookBridge
After=network.target

[Service]
Type=simple
WorkingDirectory=$APP_DIR
ExecStart=/usr/bin/npm start -- -p $PORT
Restart=always
RestartSec=5
Environment=NODE_ENV=production
Environment=PORT=$PORT

[Install]
WantedBy=multi-user.target
EOF"

pct exec "$CTID" -- systemctl daemon-reload
pct exec "$CTID" -- systemctl enable --now bookbridge

IP=$(pct exec "$CTID" -- hostname -I | awk '{print $1}')

echo ""
echo "BookBridge installed."
echo "Container ID: $CTID"
echo "Port: $PORT"
echo "Open: http://$IP:$PORT"
