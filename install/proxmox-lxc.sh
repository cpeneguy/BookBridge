#!/usr/bin/env bash
set -Eeuo pipefail

YW="\033[33m"
GN="\033[1;92m"
RD="\033[1;91m"
BL="\033[36m"
CL="\033[m"

REPO="${REPO:-https://github.com/cpeneguy/BookBridge.git}"
BRANCH="${BRANCH:-main}"
APP_DIR="${APP_DIR:-/opt/bookbridge}"
DATA_DIR="${DATA_DIR:-/opt/bookbridge/data}"
LOG_FILE="${LOG_FILE:-/tmp/bookbridge-install.log}"

# Optional overrides:
#   CTID=120 STORAGE=local-lvm BRIDGE=vmbr0 PORT=8181 bash install/proxmox-lxc.sh
#   REPO=https://github.com/you/BookBridge.git BRANCH=main bash install/proxmox-lxc.sh
#   MEDIA_HOST=/mnt/media MEMORY=2048 CORES=2 DISK_SIZE=12 bash install/proxmox-lxc.sh
HOSTNAME="${HOSTNAME:-bookbridge}"
PORT="${PORT:-8181}"
DISK_SIZE="${DISK_SIZE:-8}"
MEMORY="${MEMORY:-1024}"
CORES="${CORES:-1}"
STORAGE="${STORAGE:-local-lvm}"
BRIDGE="${BRIDGE:-vmbr0}"
MEDIA_HOST="${MEDIA_HOST:-/mnt/media}"
CTID="${CTID:-}"

header() {
  clear || true
  printf "%b\n" "${BL}"
  cat << "EOF"
 ____              _     ____       _     _
| __ )  ___   ___ | | __| __ ) _ __(_) __| | __ _  ___
|  _ \ / _ \ / _ \| |/ /|  _ \| '__| |/ _` |/ _` |/ _ \
| |_) | (_) | (_) |   < | |_) | |  | | (_| | (_| |  __/
|____/ \___/ \___/|_|\_\|____/|_|  |_|\__,_|\__, |\___|
                                             |___/
EOF
  printf "%b\n" "${CL}"
  printf "%bBookBridge Proxmox LXC Installer%b\n" "${GN}" "${CL}"
  printf "%bEbook and audiobook request automation%b\n\n" "${YW}" "${CL}"
}

fail() {
  printf "\n%bERROR:%b %s\n" "${RD}" "${CL}" "$1"
  if [ -f "$LOG_FILE" ]; then
    printf "\n%bLast log lines:%b\n" "${RD}" "${CL}"
    tail -n 60 "$LOG_FILE" || true
  fi
  exit 1
}

spinner() {
  local pid="$1"
  local msg="$2"
  local spin="|/-\\"
  local i=0

  while kill -0 "$pid" >/dev/null 2>&1; do
    printf "\r%b%s%b %s" "${GN}" "${spin:$i:1}" "${CL}" "$msg"
    i=$(((i + 1) % 4))
    sleep 0.12
  done

  if wait "$pid"; then
    printf "\r%bOK%b %s\n" "${GN}" "${CL}" "$msg"
  else
    printf "\r%bFAIL%b %s\n" "${RD}" "${CL}" "$msg"
    fail "$msg"
  fi
}

run_host_task() {
  local msg="$1"
  shift
  bash -lc "$*" >> "$LOG_FILE" 2>&1 &
  spinner "$!" "$msg"
}

run_host_direct() {
  local msg="$1"
  shift
  printf "%b->%b %s\n" "${BL}" "${CL}" "$msg"
  bash -lc "$*" 2>&1 | tee -a "$LOG_FILE"
  printf "%bOK%b %s\n" "${GN}" "${CL}" "$msg"
}

run_ct_direct() {
  local msg="$1"
  shift
  printf "%b->%b %s\n" "${BL}" "${CL}" "$msg"
  pct exec "$CTID" -- bash -lc "$*" 2>&1 | tee -a "$LOG_FILE"
  printf "%bOK%b %s\n" "${GN}" "${CL}" "$msg"
}

require_root() {
  if [ "$(id -u)" -ne 0 ]; then
    fail "Run this installer as root on the Proxmox host."
  fi
}

require_command() {
  command -v "$1" >/dev/null 2>&1 || fail "Missing required command: $1"
}

select_template() {
  pveam list local 2>/dev/null | awk '
    /debian-12.*standard.*amd64/ {print $1; exit}
    /debian-13.*standard.*amd64/ {print $1; exit}
    /ubuntu-24.04.*standard.*amd64/ {print $1; exit}
  '
}

select_available_template_name() {
  pveam available --section system | awk '
    /debian-12.*standard.*amd64/ {print $2; exit}
    /debian-13.*standard.*amd64/ {print $2; exit}
    /ubuntu-24.04.*standard.*amd64/ {print $2; exit}
  '
}

validate_storage() {
  pvesm status | awk '{print $1}' | grep -qx "$STORAGE" || fail "Storage '$STORAGE' was not found. Set STORAGE=your-storage and rerun."
}

validate_bridge() {
  ip link show "$BRIDGE" >/dev/null 2>&1 || fail "Network bridge '$BRIDGE' was not found. Set BRIDGE=your-bridge and rerun."
}

print_config() {
  printf "Container ID : %b%s%b\n" "${YW}" "$CTID" "${CL}"
  printf "Hostname     : %b%s%b\n" "${YW}" "$HOSTNAME" "${CL}"
  printf "Port         : %b%s%b\n" "${YW}" "$PORT" "${CL}"
  printf "Disk Size    : %b%sGB%b\n" "${YW}" "$DISK_SIZE" "${CL}"
  printf "Memory       : %b%sMB%b\n" "${YW}" "$MEMORY" "${CL}"
  printf "CPU Cores    : %b%s%b\n" "${YW}" "$CORES" "${CL}"
  printf "Storage      : %b%s%b\n" "${YW}" "$STORAGE" "${CL}"
  printf "Bridge       : %b%s%b\n" "${YW}" "$BRIDGE" "${CL}"
  printf "Media Mount  : %b%s%b\n" "${YW}" "$MEDIA_HOST" "${CL}"
  printf "Repository   : %b%s%b\n" "${YW}" "$REPO" "${CL}"
  printf "Branch       : %b%s%b\n\n" "${YW}" "$BRANCH" "${CL}"
}

create_env_file() {
  pct exec "$CTID" -- bash -lc "cat > '$APP_DIR/.env' <<EOF
DATABASE_URL=\"file:$DATA_DIR/bookbridge.db\"
NODE_ENV=production
NEXT_TELEMETRY_DISABLED=1
PORT=$PORT
EOF"
}

create_service() {
  pct exec "$CTID" -- bash -lc "cat > /etc/systemd/system/bookbridge.service <<EOF
[Unit]
Description=BookBridge
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
WorkingDirectory=$APP_DIR
EnvironmentFile=$APP_DIR/.env
ExecStart=/usr/bin/npm run start -- -p $PORT
Restart=always
RestartSec=5
User=root

[Install]
WantedBy=multi-user.target
EOF"
}

main() {
  header
  : > "$LOG_FILE"

  require_root
  require_command pvesh
  require_command pct
  require_command pveam
  require_command pvesm
  require_command openssl

  if [ -z "$CTID" ]; then
    CTID="$(pvesh get /cluster/nextid)"
  fi

  validate_storage
  validate_bridge
  print_config

  if pct status "$CTID" >/dev/null 2>&1; then
    fail "Container ID $CTID already exists. Set CTID to a free ID and rerun."
  fi

  run_host_task "Updating Proxmox template list" "pveam update"
  TEMPLATE="$(select_template)"

  if [ -z "$TEMPLATE" ]; then
    TEMPLATE_NAME="$(select_available_template_name)"
    if [ -z "$TEMPLATE_NAME" ]; then
      fail "Could not find a Debian 12, Debian 13, or Ubuntu 24.04 standard amd64 template."
    fi

    run_host_task "Downloading template $TEMPLATE_NAME" "pveam download local '$TEMPLATE_NAME'"
    TEMPLATE="local:vztmpl/$TEMPLATE_NAME"
  fi

  ROOT_PASSWORD="$(openssl rand -base64 18 | tr -d '\n')"

  run_host_task "Creating BookBridge LXC" "
    pct create '$CTID' '$TEMPLATE' \
      --hostname '$HOSTNAME' \
      --storage '$STORAGE' \
      --rootfs '$STORAGE:$DISK_SIZE' \
      --memory '$MEMORY' \
      --swap 512 \
      --cores '$CORES' \
      --net0 name=eth0,bridge='$BRIDGE',ip=dhcp,type=veth \
      --features nesting=1 \
      --unprivileged 1 \
      --password '$ROOT_PASSWORD'
  "

  run_host_task "Enabling container startup on boot" "pct set '$CTID' --onboot 1"

  if [ -d "$MEDIA_HOST" ]; then
    run_host_task "Mounting media path $MEDIA_HOST" "pct set '$CTID' -mp0 '$MEDIA_HOST',mp=/mnt/media,backup=0"
  else
    printf "%bWARN:%b Media path not found, skipping mount: %s\n" "${YW}" "${CL}" "$MEDIA_HOST"
  fi

  run_host_task "Starting container" "pct start '$CTID'"
  sleep 8

  run_ct_direct "Installing system dependencies" "
    export DEBIAN_FRONTEND=noninteractive
    apt-get update
    apt-get install -y curl git ca-certificates locales openssl nano procps
    sed -i 's/# en_US.UTF-8 UTF-8/en_US.UTF-8 UTF-8/' /etc/locale.gen || true
    locale-gen || true
    update-locale LANG=en_US.UTF-8 || true
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
    apt-get install -y nodejs
    node -v
    npm -v
  "

  run_ct_direct "Cloning BookBridge" "
    rm -rf '$APP_DIR'
    git clone --branch '$BRANCH' --depth 1 '$REPO' '$APP_DIR'
    mkdir -p '$DATA_DIR'
  "

  run_ct_direct "Installing npm packages" "
    cd '$APP_DIR'
    if [ -f package-lock.json ]; then
      npm ci
    else
      npm install
    fi
  "

  run_host_task "Creating environment file" "true"
  create_env_file

  run_ct_direct "Preparing Prisma database" "
    cd '$APP_DIR'
    npx prisma generate
    npx prisma db push
  "

  run_ct_direct "Building BookBridge" "
    cd '$APP_DIR'
    npm run build
  "

  run_host_task "Creating systemd service" "true"
  create_service

  run_ct_direct "Starting BookBridge service" "
    systemctl daemon-reload
    systemctl enable --now bookbridge
    systemctl --no-pager status bookbridge
  "

  IP="$(pct exec "$CTID" -- hostname -I | awk '{print $1}')"

  printf "\n%bINSTALL COMPLETE%b\n\n" "${GN}" "${CL}"
  printf "Container ID : %b%s%b\n" "${YW}" "$CTID" "${CL}"
  printf "Hostname     : %b%s%b\n" "${YW}" "$HOSTNAME" "${CL}"
  printf "Port         : %b%s%b\n" "${YW}" "$PORT" "${CL}"
  printf "Media Mount  : %b/mnt/media%b\n" "${YW}" "${CL}"
  printf "URL          : %bhttp://%s:%s%b\n" "${GN}" "$IP" "$PORT" "${CL}"
  printf "Root password: %b%s%b\n\n" "${YW}" "$ROOT_PASSWORD" "${CL}"

  printf "%bUseful commands:%b\n" "${BL}" "${CL}"
  printf "pct enter %s\n" "$CTID"
  printf "pct exec %s -- systemctl status bookbridge\n" "$CTID"
  printf "pct exec %s -- journalctl -u bookbridge -f\n" "$CTID"
  printf "pct exec %s -- cat %s/.env\n" "$CTID" "$APP_DIR"
}

main "$@"
