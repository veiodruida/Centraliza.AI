#!/bin/bash
# Centraliza.ai - macOS double-clickable installer.
# Keeps the Terminal window open on errors so the user can read the message.

cd "$(dirname "$0")"
bash ./setup-macos.sh "$@"
status=$?
if [ "$status" -ne 0 ]; then
  echo
  echo "Setup failed (exit code $status)."
  read -r -n 1 -s -p "Press any key to close this window..."
  echo
fi
exit "$status"
