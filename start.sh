#!/usr/bin/env bash
# Centraliza.ai - universal launcher for Linux and macOS.
# Run with: ./start.sh   (or: bash start.sh)

set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$APP_DIR"

# Prefer the portable Node.js installed by setup.sh / setup-macos.sh.
for NODE_BIN_DIR in \
  "${XDG_DATA_HOME:-$HOME/.local/share}/centraliza-ai/node/bin" \
  "$HOME/Library/Application Support/Centraliza.ai/node/bin"
do
  if [ -x "$NODE_BIN_DIR/node" ]; then
    export PATH="$NODE_BIN_DIR:$PATH"
    break
  fi
done

PORT="${PORT:-4000}"
OPEN_BROWSER=1
if [ "${1:-}" = "--no-browser" ]; then OPEN_BROWSER=0; fi

if ! command -v node >/dev/null 2>&1; then
  echo "[ERROR] Node.js was not found."
  echo "        Run ./setup.sh on Linux or ./setup-macos.sh on macOS."
  exit 1
fi

NODE_VERSION="$(node -v 2>/dev/null || true)"
NODE_MAJOR="$(printf '%s' "$NODE_VERSION" | sed 's/^v//' | cut -d. -f1)"
if [ -n "$NODE_MAJOR" ] && [ "$NODE_MAJOR" -lt 20 ] 2>/dev/null; then
  echo "[ERROR] Node.js 20+ is required (found $NODE_VERSION)."
  echo "        Run the setup script to install a compatible version."
  exit 1
fi

if [ ! -d "$APP_DIR/node_modules/express" ] || [ ! -d "$APP_DIR/frontend/node_modules" ] || [ ! -f "$APP_DIR/frontend/dist/index.html" ]; then
  echo "[ERROR] Installation is incomplete (dependencies or frontend build missing)."
  echo "        Run ./setup.sh on Linux or ./setup-macos.sh on macOS."
  exit 1
fi

if [ "$OPEN_BROWSER" = "1" ]; then
  (
    sleep 2
    URL="http://localhost:${PORT}"
    if command -v xdg-open >/dev/null 2>&1; then
      xdg-open "$URL" >/dev/null 2>&1 || true
    elif command -v open >/dev/null 2>&1; then
      open "$URL" >/dev/null 2>&1 || true
    fi
  ) &
fi

echo "Centraliza.ai - http://localhost:${PORT}"
echo "Node.js: $NODE_VERSION"
echo "Press Ctrl+C to stop."
exec node server.js
