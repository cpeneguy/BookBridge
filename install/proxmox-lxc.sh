#!/usr/bin/env bash
set -e

YW=$(echo "\033[33m")
GN=$(echo "\033[1;92m")
RD=$(echo "\033[1;91m")
BL=$(echo "\033[36m")
CL=$(echo "\033[m")

REPO="https://github.com/cpeneguy/BookBridge.git"
APP_DIR="/opt/bookbridge"
LOG_FILE="/tmp/bookbridge-install.log"
CTID=$(pvesh get /cluster/nextid)
HOSTNAME="bookbridge"

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

spinner() {
  local pid=$1
  local msg="$2"
  local spin='⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏'

  while ps -p "$pid" >/dev/null 2>&1; do
    for i in $(seq 0 9); do
      printf "\r${GN}%s${CL} %s" "${spin:$i:1}" "$msg"
      sleep 0.08
      ps -p "$pid" >/dev/null 2>&1 || break
    done
  done

  wait "$pid"
  local exit_code=$?

  if [ "$exit_code" -eq 0 ]; then
    printf "\r${GN}✓${CL} %s\n" "$msg"
  else
    printf "\r${RD}✗${CL} %s\n" "$msg"
    echo ""
    echo -e "${RD}Command failed. Last log lines:${CL}"
    tail -n 40 "$LOG_FILE"
    exit "$exit_code"
  fi
}

run_task() {
  local msg="$1"
  shift
  bash -c "$*" >> "$LOG_FILE" 2>&1 &
  spinner $! "$msg"
}

header

echo -n "" > "$LOG_FILE"

CTID=$(pvesh get /cluster/nextid)
HOSTNAME="bookbridge"

echo -e "Container ID : ${YW}$CTID${CL} ${GN}(auto-selected)${CL}"
echo -e "Hostname     : ${YW}$HOSTNAME${CL}"
echo ""

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

if pct status "$CTID" >/dev/null 2>&1; then
  echo -e "${RD}Container ID $CTID already exists. Choose a different CTID.${CL}"
  exit 1
fi

run_task "Checking Proxmox template list" "pveam update"

TEMPLATE=$(pveam list local | awk '
  /debian-12.*standard.*amd64/ {print $1; exit}
  /debian-13.*standard.*amd64/ {print $1; exit}
  /ubuntu-24.04.*standard.*amd64/ {print $1; exit}
')

if [ -z "$TEMPLATE" ]; then
  TEMPLATE_NAME=$(pveam available --section system | awk '
    /debian-12.*standard.*amd64/ {print $2; exit}
    /debian-13.*standard.*amd64/ {print $2; exit}
    /ubuntu-24.04.*standard.*amd64/ {print $2; exit}
  ')

  if [ -z "$TEMPLATE_NAME" ]; then
    echo -e "${RD}Could not find Debian 12, Debian 13, or Ubuntu 24.04 template.${CL}"
    exit 1
  fi

  run_task "Downloading template $TEMPLATE_NAME" "pveam download local '$TEMPLATE_NAME'"
  TEMPLATE="local:vztmpl/$TEMPLATE_NAME"
fi

run_task "Creating BookBridge LXC" "
pct create '$CTID' '$TEMPLATE' \
  --hostname '$HOSTNAME' \
  --storage local-lvm \
  --rootfs local-lvm:'$DISK_SIZE' \
  --memory '$MEMORY' \
  --swap 512 \
  --cores '$CORES' \
  --net0 name=eth0,bridge=vmbr0,ip=dhcp,type=veth \
  --features nesting=1 \
  --unprivileged 1 \
  --password changeme
"

run_task "Enabling container startup on boot" "pct set '$CTID' -onboot 1"

if [ -d "$MEDIA_HOST" ]; then
  run_task "Mounting media path $MEDIA_HOST" "pct set '$CTID' -mp0 '$MEDIA_HOST',mp=/mnt/media"
else
  echo -e "${YW}⚠ Media path not found, skipping mount: $MEDIA_HOST${CL}"
fi

run_task "Starting container" "pct start '$CTID'"

sleep 10

run_task "Installing system dependencies" "
pct exec '$CTID' -- bash -c '
apt update
apt install -y curl git ca-certificates nano
apt install -y locales
sed -i 's/# en_US.UTF-8 UTF-8/en_US.UTF-8 UTF-8/' /etc/locale.gen
locale-gen
update-locale LANG=en_US.UTF-8
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs
'
"

run_task "Cloning BookBridge" "
pct exec '$CTID' -- bash -c '
rm -rf $APP_DIR
git clone $REPO $APP_DIR
'
"

run_task "Installing npm packages" "
pct exec '$CTID' -- bash -c '
cd $APP_DIR
npm install
'
"

run_task "Preparing Prisma" "
pct exec '$CTID' -- bash -c '
cd $APP_DIR
npx prisma generate || true
npx prisma migrate deploy || true
'
"

run_task "Building BookBridge" "
pct exec '$CTID' -- bash -c '
cd $APP_DIR
npm run build
'
"

run_task "Creating systemd service" "
pct exec '$CTID' -- bash -c 'cat > /etc/systemd/system/bookbridge.service <<EOF
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
EOF'
"

run_task "Starting BookBridge service" "
pct exec '$CTID' -- systemctl daemon-reload
pct exec '$CTID' -- systemctl enable --now bookbridge
"

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
