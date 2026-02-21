#!/bin/bash
# Focus Guard — one-time setup for native messaging host.
# Run this AFTER loading the extension in Chrome.

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
HOST_DIR="$SCRIPT_DIR/native-host"
HOST_SCRIPT="$HOST_DIR/focus_guard_host.sh"
HOST_NAME="com.focusguard.host"
MANIFEST_DIR="$HOME/Library/Application Support/Google/Chrome/NativeMessagingHosts"

echo ""
echo "  Focus Guard — Native Host Setup"
echo "  ================================"
echo ""

# 1. Get extension ID
echo "  Open chrome://extensions, find Focus Guard,"
echo "  and copy the ID (the long string under the name)."
echo ""
read -p "  Paste your extension ID: " EXT_ID

if [ -z "$EXT_ID" ]; then
  echo "  Error: Extension ID is required."
  exit 1
fi

# Trim whitespace
EXT_ID=$(echo "$EXT_ID" | xargs)

# 2. Make host scripts executable
chmod +x "$HOST_SCRIPT"
chmod +x "$HOST_DIR/focus_guard_host.py"

# 3. Create manifest directory
mkdir -p "$MANIFEST_DIR"

# 4. Write manifest
MANIFEST_PATH="$MANIFEST_DIR/$HOST_NAME.json"
cat > "$MANIFEST_PATH" << EOF
{
  "name": "$HOST_NAME",
  "description": "Focus Guard - Obsidian vault access",
  "path": "$HOST_SCRIPT",
  "type": "stdio",
  "allowed_origins": ["chrome-extension://$EXT_ID/"]
}
EOF

echo ""
echo "  Done! Native host installed."
echo ""
echo "  Host script:  $HOST_SCRIPT"
echo "  Manifest:     $MANIFEST_PATH"
echo "  Extension ID: $EXT_ID"
echo ""
echo "  Reload the extension in Chrome and you're all set."
echo ""
