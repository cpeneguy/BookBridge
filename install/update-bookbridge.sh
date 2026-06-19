#!/usr/bin/env bash
set -Eeuo pipefail

APP_DIR="${APP_DIR:-/opt/bookbridge}"
SERVICE_NAME="${SERVICE_NAME:-bookbridge}"
BRANCH="${BRANCH:-main}"
LOG_FILE="${LOG_FILE:-/var/log/bookbridge-update.log}"

timestamp() {
  date +"%Y-%m-%d %H:%M:%S"
}

log() {
  printf "[%s] %s\n" "$(timestamp)" "$*"
}

run() {
  log "$*"
  "$@"
}

main() {
  exec > >(tee -a "$LOG_FILE") 2>&1

  log "Starting BookBridge update"

  if [ ! -d "$APP_DIR/.git" ]; then
    log "ERROR: $APP_DIR is not a git checkout."
    exit 1
  fi

  cd "$APP_DIR"

  run git fetch origin "$BRANCH"

  local_before="$(git rev-parse HEAD)"
  remote_after="$(git rev-parse "origin/$BRANCH")"

  if [ "$local_before" = "$remote_after" ]; then
    log "Already up to date at $local_before."
    exit 0
  fi

  log "Updating from $local_before to $remote_after"

  run git reset --hard "origin/$BRANCH"

  if [ -f "$APP_DIR/install/update-bookbridge.sh" ] && [ -d /usr/local/bin ]; then
    run install -m 0755 "$APP_DIR/install/update-bookbridge.sh" /usr/local/bin/bookbridge-update
  fi

  if [ -f package-lock.json ]; then
    run npm ci
  else
    run npm install
  fi

  run npx prisma generate
  run npx prisma db push
  run rm -rf .next
  run npm run build

  if command -v systemctl >/dev/null 2>&1 && systemctl list-unit-files "$SERVICE_NAME.service" >/dev/null 2>&1; then
    run systemctl restart "$SERVICE_NAME"
  else
    log "No systemd service named $SERVICE_NAME found. Restart BookBridge manually."
  fi

  log "BookBridge update complete"
}

main "$@"
