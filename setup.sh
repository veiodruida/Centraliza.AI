#!/usr/bin/env bash
# Centraliza.ai - Linux and macOS setup.
# Installs a supported Node.js (portable, no sudo), dependencies and the
# production frontend build, then creates the `central` launcher.
#
# Usage:
#   ./setup.sh            Linux (or: bash setup.sh)
#   ./setup-macos.sh      macOS wrapper
#   ./setup.sh --check    Only verify the installation
#   ./setup.sh --silent   No extra prompts (currently non-interactive anyway)

set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$APP_DIR"

OS_NAME="$(uname -s 2>/dev/null || echo unknown)"
case "$OS_NAME" in
  Linux)  PLATFORM="linux" ;;
  Darwin) PLATFORM="darwin" ;;
  *) echo "[ERROR] Unsupported operating system: $OS_NAME"; exit 1 ;;
esac

if [ "$PLATFORM" = "darwin" ]; then
  NODE_DIR="$HOME/Library/Application Support/Centraliza.ai/node"
  BIN_DIR="$HOME/.local/bin"
else
  NODE_DIR="${XDG_DATA_HOME:-$HOME/.local/share}/centraliza-ai/node"
  BIN_DIR="$HOME/.local/bin"
fi

MIN_MAJOR=22
MIN_MINOR=5
CHECK_ONLY=0
for arg in "$@"; do
  case "$arg" in
    --check) CHECK_ONLY=1 ;;
    --silent) ;;
    --help|-h)
      echo "Usage: $0 [--check] [--silent]"
      exit 0
      ;;
    *) echo "[WARN] Unknown option: $arg" ;;
  esac
done

have() { command -v "$1" >/dev/null 2>&1; }

node_ok() {
  have node || return 1
  local version major minor rest
  version="$(node -v 2>/dev/null | sed 's/^v//')"
  major="${version%%.*}"
  rest="${version#*.}"
  minor="${rest%%.*}"
  [ -n "$major" ] || return 1
  if [ "$major" -gt "$MIN_MAJOR" ] 2>/dev/null; then return 0; fi
  if [ "$major" -eq "$MIN_MAJOR" ] 2>/dev/null && [ "$minor" -ge "$MIN_MINOR" ] 2>/dev/null; then return 0; fi
  return 1
}

download_to() {
  local url="$1" dest="$2"
  if have curl; then
    curl -fL --retry 3 --connect-timeout 30 -o "$dest" "$url"
  elif have wget; then
    wget -q --show-progress -O "$dest" "$url"
  else
    echo "[ERROR] curl or wget is required to download Node.js." >&2
    return 1
  fi
}

download_text() {
  local url="$1"
  if have curl; then
    curl -fsSL "$url"
  elif have wget; then
    wget -qO- "$url"
  else
    echo "[ERROR] curl or wget is required to download Node.js." >&2
    return 1
  fi
}

install_portable_node() {
  local arch listing file tmp extracted
  case "$(uname -m)" in
    x86_64|amd64) arch="x64" ;;
    arm64|aarch64) arch="arm64" ;;
    *) echo "[ERROR] Unsupported CPU architecture: $(uname -m)"; return 1 ;;
  esac

  echo "[1/5] Node.js $MIN_MAJOR.$MIN_MINOR+ not found; downloading portable Node.js 22 LTS..."
  local base="https://nodejs.org/dist/latest-v22.x"
  listing="$(download_text "$base/")" || return 1
  file="$(printf '%s' "$listing" | grep -oE "node-v22[0-9.]+-${PLATFORM}-${arch}\\.tar\\.gz" | head -n1)"
  if [ -z "$file" ]; then
    echo "[ERROR] Could not find a Node.js 22 package for ${PLATFORM}/${arch}." >&2
    return 1
  fi

  tmp="$(mktemp -d 2>/dev/null || mktemp -d -t centraliza-node)"
  trap "rm -rf '$tmp'" EXIT
  echo "       $file"
  download_to "$base/$file" "$tmp/$file" || return 1
  echo "       Extracting..."
  tar -xzf "$tmp/$file" -C "$tmp"
  extracted="$tmp/${file%.tar.gz}"
  if [ ! -x "$extracted/bin/node" ]; then
    echo "[ERROR] The Node.js package did not contain bin/node." >&2
    return 1
  fi

  rm -rf "$NODE_DIR"
  mkdir -p "$(dirname "$NODE_DIR")"
  mv "$extracted" "$NODE_DIR"
  export PATH="$NODE_DIR/bin:$PATH"
  node_ok || { echo "[ERROR] Node.js was installed but does not run correctly." >&2; return 1; }
  echo "       Installed: $NODE_DIR ($(node -v))"
}

install_launcher() {
  mkdir -p "$BIN_DIR"
  cat > "$BIN_DIR/central" <<EOF
#!/usr/bin/env bash
exec "$APP_DIR/start.sh" "\$@"
EOF
  chmod +x "$BIN_DIR/central" "$APP_DIR/start.sh" 2>/dev/null || true

  # Add ~/.local/bin to PATH in common shells (idempotent).
  local rc
  for rc in "$HOME/.bashrc" "$HOME/.zshrc" "$HOME/.profile"; do
    [ -f "$rc" ] || continue
    if ! grep -qF '# Centraliza.ai PATH' "$rc" 2>/dev/null; then
      {
        printf '\n# Centraliza.ai PATH\n'
        printf 'case ":$PATH:" in *":$HOME/.local/bin:"*) ;; *) export PATH="$HOME/.local/bin:$PATH" ;; esac\n'
      } >> "$rc"
    fi
  done
  if [ ! -f "$HOME/.bashrc" ] && [ ! -f "$HOME/.zshrc" ] && [ ! -f "$HOME/.profile" ]; then
    if [ "$PLATFORM" = "darwin" ]; then
      printf 'export PATH="$HOME/.local/bin:$PATH"\n' > "$HOME/.zshrc"
    else
      printf 'export PATH="$HOME/.local/bin:$PATH"\n' > "$HOME/.profile"
    fi
  fi

  if [ "$PLATFORM" = "linux" ]; then
    local apps_dir="$HOME/.local/share/applications"
    mkdir -p "$apps_dir"
    cat > "$apps_dir/centraliza-ai.desktop" <<EOF
[Desktop Entry]
Type=Application
Name=Centraliza.ai
Comment=Local AI orchestrator for LM Studio, Ollama, llama.cpp and ComfyUI
Exec=$APP_DIR/start.sh
Path=$APP_DIR
Terminal=true
Categories=Utility;Development;
EOF
    chmod +x "$apps_dir/centraliza-ai.desktop" 2>/dev/null || true
    echo "       Application menu entry: Centraliza.ai"
  else
    # macOS: double-clickable launcher on the Desktop.
    local desktop="$HOME/Desktop"
    mkdir -p "$desktop"
    cat > "$desktop/Centraliza.ai.command" <<EOF
#!/bin/bash
exec "$APP_DIR/start.command" "\$@"
EOF
    chmod +x "$desktop/Centraliza.ai.command" "$APP_DIR/start.command" 2>/dev/null || true
    echo "       Desktop launcher: ~/Desktop/Centraliza.ai.command"
  fi
  echo "       Command 'central' installed in $BIN_DIR/central"
}

if ! node_ok; then
  if [ "$CHECK_ONLY" = "1" ]; then
    echo "[check] Node.js $MIN_MAJOR.$MIN_MINOR+ is required but was not found."
    exit 2
  fi
  install_portable_node
else
  echo "[1/5] Node.js $(node -v) found."
fi

export PATH="$NODE_DIR/bin:$PATH"
if ! node_ok; then
  echo "[ERROR] Node.js $MIN_MAJOR.$MIN_MINOR+ is required."
  exit 1
fi
if ! have npm; then
  echo "[ERROR] npm was not found next to Node.js."
  exit 1
fi

if [ "$CHECK_ONLY" = "1" ]; then
  missing=0
  if [ -d "$APP_DIR/node_modules/express" ]; then echo "[check] Root dependencies present."; else echo "[check] Root dependencies missing - run setup."; missing=1; fi
  if [ -d "$APP_DIR/frontend/node_modules" ]; then echo "[check] Frontend dependencies present."; else echo "[check] Frontend dependencies missing - run setup."; missing=1; fi
  if [ -f "$APP_DIR/frontend/dist/index.html" ]; then echo "[check] Frontend build present."; else echo "[check] Frontend build missing - run setup."; missing=1; fi
  exit "$missing"
fi

echo "[2/5] Installing root dependencies..."
npm install --no-audit --no-fund

echo "[3/5] Installing frontend dependencies..."
( cd frontend && npm install --no-audit --no-fund )

echo "[4/5] Building the frontend..."
( cd frontend && rm -rf dist && npm run build )

echo "[5/5] Creating the 'central' launcher and shortcuts..."
install_launcher

echo
echo "==================================================="
echo "  SETUP COMPLETE!"
echo
echo "  Start Centraliza.ai with:"
echo "      ./start.sh"
echo "      central"
if [ "$PLATFORM" = "darwin" ]; then
  echo "      or double-click ~/Desktop/Centraliza.ai.command"
else
  echo "      or open 'Centraliza.ai' from the application menu"
fi
echo "==================================================="
