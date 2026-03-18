#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${1:-/opt/aizj}"
SRC_TAR="${2:-/tmp/aizj-src.tar}"
WEB_TAR="${3:-/tmp/aizj-web.tar}"

if [[ ! -f "$SRC_TAR" ]]; then
  echo "[ERROR] source tar not found: $SRC_TAR" >&2
  exit 1
fi

if [[ ! -f "$WEB_TAR" ]]; then
  echo "[ERROR] image tar not found: $WEB_TAR" >&2
  exit 1
fi

mkdir -p "$APP_DIR"
tar -xf "$SRC_TAR" -C "$APP_DIR"

mkdir -p "$APP_DIR/data/sqlite" "$APP_DIR/logs/web" "$APP_DIR/logs/nginx"

if [[ ! -f "$APP_DIR/.env" ]]; then
  echo "[ERROR] missing $APP_DIR/.env. Create it before deployment." >&2
  exit 1
fi

docker load -i "$WEB_TAR" >/tmp/aizj-docker-load.log

cd "$APP_DIR"
docker compose up -d --no-build

rm -f "$SRC_TAR" "$WEB_TAR"
echo "deploy-done"
