#!/usr/bin/env bash
# Centraliza.ai - macOS setup wrapper.
# The shared cross-platform setup lives in setup.sh; this file exists so macOS
# users have a dedicated entry point and can double-click setup.command.

set -euo pipefail
APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$APP_DIR"

if [ "$(uname -s)" != "Darwin" ]; then
  echo "[ERROR] setup-macos.sh is intended for macOS. Use setup.sh on Linux."
  exit 1
fi

exec bash "$APP_DIR/setup.sh" "$@"
