#!/bin/bash
# Centraliza.ai - macOS double-clickable launcher.
# Finder runs .command files in Terminal. Closing the Terminal window stops the
# server; use Ctrl+C first if you want a clean shutdown.

cd "$(dirname "$0")"
exec bash ./start.sh "$@"
