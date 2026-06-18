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

run_spinner_task() {
  local msg="$1"
  shift
  bash -c "$*" >> "$LOG_FILE" 2>&1 &
  spinner $! "$msg"
}

run_direct_task() {
  local msg="$1"
  shift
  echo -e "${BL}➜${CL} $msg"
  bash -c "$*" 2>&1 | tee -a "$LOG_FILE"
  echo -e "${GN}✓${CL} $msg"
}

header
echo -n "" > "$LOG_FILE"

CTID=$(pvesh get /cluster/nextid)
HOSTNAME="bookbridge"
PORT="8181"
DISK_SIZE="8"
MEMORY="1024"
CORES="1"
MEDIA_HOST="/mnt/media"

echo -e "Container ID : ${YW}$CTID${CL} ${GN}(auto-selected)${CL}"
echo -e "Hostname     : ${YW}$HOSTNAME${CL}"
echo -e "Port         : ${YW}$PORT${CL}"
echo -e "Disk Size    : ${YW}${DISK_SIZE}GB${CL}"
echo -e "Memory       : ${YW}${MEMORY}MB${CL}"
echo -e "CPU Cores    : ${YW}$CORES${CL}"
echo -e "Media Mount  : ${YW}$MEDIA_HOST${CL}"
echo ""

if pct status "$CTID" >/dev/null 2>&1; then
  echo -e "${RD}Container ID $CTID already exists. Try again.${CL}"
  exit 1
fi

run_spinner_task "Checking Proxmox template list" "pveam update"

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

  run_spinner_task "Downloading template $TEMPLATE_NAME" "pveam download local '$TEMPLATE_NAME'"
  TEMPLATE="local:vztmpl/$TEMPLATE_NAME"
fi

run_spinner_task "Creating BookBridge LXC" "
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

run_spinner_task "Enabling container startup on boot" "pct set '$CTID' -onboot 1"

if [ -d "$MEDIA_HOST" ]; then
  run_spinner_task "Mounting media path $MEDIA_HOST" "pct set '$CTID' -mp0 '$MEDIA_HOST',mp=/mnt/media"
else
  echo -e "${YW}⚠ Media path not found, skipping mount: $MEDIA_HOST${CL}"
fi

run_spinner_task "Starting container" "pct start '$CTID'"
sleep 8

run_direct_task "Installing system dependencies" "
pct exec '$CTID' -- bash -c '
export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get install -y curl git ca-certificates nano locales openssl
sed -i \"s/# en_US.UTF-8 UTF-8/en_US.UTF-8 UTF-8/\" /etc/locale.gen || true
locale-gen || true
update-locale LANG=en_US.UTF-8 || true
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt-get install -y nodejs
node -v
npm -v
'
"

run_direct_task "Cloning BookBridge" "
pct exec '$CTID' -- bash -c '
rm -rf $APP_DIR
git clone $REPO $APP_DIR
'
"

run_direct_task "Installing npm packages" "
pct exec '$CTID' -- bash -c '
cd $APP_DIR
npm install
'
"

run_direct_task "Creating environment file" "
pct exec '$CTID' -- bash -c '
cd $APP_DIR
cat > .env <<EOF
DATABASE_URL=\"file:./prisma/dev.db\"
PORT=$PORT
NODE_ENV=production
EOF
'
"

run_direct_task "Preparing Prisma database" "
pct exec '$CTID' -- bash -c '
cd $APP_DIR
npx prisma generate
npx prisma db push
'
"

run_direct_task "Building BookBridge" "
pct exec '$CTID' -- bash -c '
cd $APP_DIR
npm run build
'
"

run_spinner_task "Creating systemd service" "
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
Environment=DATABASE_URL=file:./prisma/dev.db

[Install]
WantedBy=multi-user.target
EOF'
"

run_spinner_task "Starting BookBridge service" "
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
