#!/usr/bin/env bash
set -euo pipefail
LABEL="com.ppt-style-transfer.api"
PLIST_DEST="${HOME}/Library/LaunchAgents/${LABEL}.plist"
LAUNCHER="${HOME}/.local/bin/ppt-style-transfer-api.sh"
UID_NUM="$(id -u)"

launchctl bootout "gui/${UID_NUM}/${LABEL}" 2>/dev/null || true
launchctl unload "$PLIST_DEST" 2>/dev/null || true
rm -f "$PLIST_DEST"
rm -f "$LAUNCHER"

if command -v lsof >/dev/null 2>&1; then
  PIDS=$(lsof -ti :8000 2>/dev/null || true)
  if [[ -n "${PIDS}" ]]; then
    echo "结束占用 8000 的进程: ${PIDS}"
    kill -9 ${PIDS} 2>/dev/null || true
  fi
fi

echo "已卸载 ${LABEL}"
