#!/usr/bin/env bash
#
# Build and deploy Varagh to a bare-metal host over SSH/SCP.
#
# Target layout on the host (DEPLOY_DIR, default /opt/varagh):
#   /opt/varagh/
#     ├── web/         ← static PWA (served by nginx)
#     ├── server.cjs   ← bundled Node server (run by systemd)
#     └── data/        ← SQLite database (created on first run)
#
# Usage:
#   DEPLOY_TARGET=user@host pnpm deploy
#   # or:
#   scripts/deploy.sh user@host
#
# The web app and the Socket.IO server live on SEPARATE origins:
#   web    → https://varagh.artanova.top         (static, served by nginx)
#   server → https://varagh-server.artanova.top  (nginx → 127.0.0.1:3001)
# So the client bundle is built with VITE_SERVER_URL pointing at the server
# subdomain, and the server's CORS (WEB_ORIGIN) must allow the web origin.
#
# Env overrides:
#   DEPLOY_TARGET    ssh target "user@host" (or pass as $1)
#   DEPLOY_DIR       remote install dir            (default: /opt/varagh)
#   DEPLOY_SSH_PORT  ssh port                       (default: 22)
#   DEPLOY_SERVICE   systemd unit to restart        (default: varagh; "" to skip)
#   VITE_SERVER_URL  Socket.IO origin baked into the web build
#                    (default: https://varagh-server.artanova.top)
#
set -euo pipefail

TARGET="${DEPLOY_TARGET:-${1:-}}"
REMOTE_DIR="${DEPLOY_DIR:-/opt/varagh}"
SSH_PORT="${DEPLOY_SSH_PORT:-22}"
SERVICE="${DEPLOY_SERVICE:-varagh}"
SERVER_URL="${VITE_SERVER_URL:-https://varagh-server.artanova.top}"

if [ -z "$TARGET" ]; then
  echo "Usage: DEPLOY_TARGET=user@host pnpm deploy   (or: scripts/deploy.sh user@host)" >&2
  exit 1
fi

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "▶ Building web (server: $SERVER_URL) + server bundle…"
VITE_SERVER_URL="$SERVER_URL" pnpm --filter @varagh/web build
pnpm --filter @varagh/server build:bundle

SSH=(ssh -p "$SSH_PORT" "$TARGET")
SCP=(scp -P "$SSH_PORT")

echo "▶ Preparing $REMOTE_DIR on $TARGET…"
"${SSH[@]}" "mkdir -p '$REMOTE_DIR/web' '$REMOTE_DIR/data'"

echo "▶ Uploading server.cjs…"
"${SCP[@]}" apps/server/dist/server.cjs "$TARGET:$REMOTE_DIR/server.cjs"

echo "▶ Uploading web/ (replacing old assets)…"
"${SSH[@]}" "rm -rf '$REMOTE_DIR/web'/*"
"${SCP[@]}" -r apps/web/dist/* "$TARGET:$REMOTE_DIR/web/"

if [ -n "$SERVICE" ]; then
  echo "▶ Restarting service '$SERVICE'…"
  "${SSH[@]}" "sudo systemctl restart '$SERVICE' || systemctl restart '$SERVICE'" \
    || echo "⚠ Could not restart '$SERVICE' — restart it manually on the host." >&2
fi

echo "✓ Deployed to $TARGET:$REMOTE_DIR"
