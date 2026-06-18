#!/usr/bin/env bash
set -e

YW=$(echo "\033[33m")
GN=$(echo "\033[1;92m")
RD=$(echo "\033[1;91m")
BL=$(echo "\033[36m")
CL=$(echo "\033[m")

REPO="https://github.com/cpeneguy/BookBridge.git"
APP_DIR="/opt/bookbridge"

header() {
  clear
  echo -e "${BL}"
  cat << "EOF"
 ____              _     ____       _     _            
| __ )  ___   ___ | | __| __ ) _ __(_) __| | __ _  ___ 
|  _ \ / _ \ / _ \| |/ /|  _ \| '__| |/ _` |/ _` |/ _ \
| |_) | (_) | (_) |   < | |_) | |  | | (_| | (_| |  __/
|____/ \___/ \___/|_|\_\|____/|_|  |_|\__,_|\__, |\___|
                                             |___/      
EOF
  echo -e "${CL}"
  echo -e "${GN}BookBridge LXC Installer${CL}"
  echo -e "${YW}Jellyseerr-style ebook and audiobook requests${CL}"
  echo ""
}

msg_info() {
  echo -ne "${BL}[INFO]${CL} $1..."
}

msg_ok() {
  echo -e "${GN} ✓ Done${CL}"
}

msg_error() {
  echo -e "${RD} ✗ Failed${CL}"
}

fail() {
  msg_error
  echo -e "${RD}$1${CL}"
  exit 1
}

header

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

echo ""

msg_info "Checking Proxmox container ID"
if pct status "$CTID" >/dev/null 2>&1; then
  fail "Container ID $CTID already exists. Choose a different CTID."
fi
msg_ok

msg_info "Finding compatible container template"
TEMPLATE=$(pveam list local | awk '
  /debian-12.*standard.*amd64/ {print $1; exit}
  /debian-13.*standard.*amd64/ {print $1; exit}
  /ubuntu-24.04.*standard.*amd64/ {print $1; exit}
')

if [ -z "$TEMPLATE" ]; then
  msg_ok
  msg_info "Updating Proxmox template list"
  pveam update >/dev/null
  msg_ok

  msg_info "Finding downloadable template"
  TEMPLATE_NAME=$(pveam available --section system | awk '
    /debian-12.*standard.*amd64/ {print $2; exit}
    /debian-13.*standard.*amd64/ {print $2; exit}
    /ubuntu-24.04.*standard.*amd64/ {print $2; exit}
  ')

  if [ -z "$TEMPLATE_NAME" ]; then
    fail "Could not find Debian 12, Debian 13, or Ubuntu 24.04 template."
  fi
  msg_ok

  msg_info "Downloading template $TEMPLATE_NAME"
  pveam download local "$TEMPLATE_NAME" >/dev/null
  TEMPLATE="local:vztmpl/$TEMPLATE_NAME"
  msg_ok
else
  msg_ok
fi

msg_info "Creating BookBridge LXC"
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
  --password changeme >/dev/null
msg_ok

if [ -d "$MEDIA_HOST" ]; then
  msg_info "Mounting media path $MEDIA_HOST"
  pct set "$CTID" -mp0 "$MEDIA_HOST",mp=/mnt/media >/dev/null
  msg_ok
else
  echo -e "${YW}[WARN]${CL} Media path not found, skipping mount: $MEDIA_HOST"
fi

msg_info "Starting container"
pct start "$CTID" >/dev/null
sleep 10
msg_ok

msg_info "Installing system dependencies"
pct exec "$CTID" -- bash -c "
apt update >/dev/null
apt install -y curl git ca-certificates nano >/dev/null
curl -fsSL https://deb.nodesource.com/setup_20.x | bash - >/dev/null
apt install -y nodejs >/dev/null
" || fail "Dependency installation failed."
msg_ok

msg_info "Cloning BookBridge"
pct exec "$CTID" -- bash -c "
rm -rf $APP_DIR
git clone $REPO $APP_DIR >/dev/null
" || fail "Git clone failed."
msg_ok

msg_info "Installing npm packages"
pct exec "$CTID" -- bash -c "
cd $APP_DIR
npm install >/dev/null
" || fail "npm install failed."
msg_ok

msg_info "Preparing Prisma"
pct exec "$CTID" -- bash -c "
cd $APP_DIR
npx prisma generate >/dev/null 2>&1 || true
npx prisma migrate deploy >/dev/null 2>&1 || true
"
msg_ok

msg_info "Building BookBridge"
pct exec "$CTID" -- bash -c "
cd $APP_DIR
npm run build >/dev/null
" || fail "Build failed."
msg_ok

msg_info "Creating systemd service"
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
msg_ok

msg_info "Starting BookBridge service"
pct exec "$CTID" -- systemctl daemon-reload >/dev/null
pct exec "$CTID" -- systemctl enable --now bookbridge >/dev/null
msg_ok

IP=$(pct exec "$CTID" -- hostname -I | awk '{print $1}')

echo ""
echo -e "${GN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${CL}"
echo -e "${GN}              INSTALL COMPLETE${CL}"
echo -e "${GN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${CL}"
echo ""
echo -e "Container ID : ${YW}$CTID${CL}"
echo -e "Hostname     : ${YW}$HOSTNAME${CL}"
echo -e "Port         : ${YW}$PORT${CL}"
echo -e "Media Mount  : ${YW}/mnt/media${CL}"
echo -e "URL          : ${GN}http://$IP:$PORT${CL}"
echo ""
echo -e "${BL}Useful commands:${CL}"
echo "pct enter $CTID"
echo "pct exec $CTID -- systemctl status bookbridge"
echo "pct exec $CTID -- journalctl -u bookbridge -f"
echo ""
