#!/usr/bin/env bash
# 移除 launchd 常驻任务，并尝试结束占用 3000 的 next 进程
set -euo pipefail
LABEL="com.ppt-web.next"
PLIST_DEST="${HOME}/Library/LaunchAgents/${LABEL}.plist"
UID_NUM="$(id -u)"

launchctl bootout "gui/${UID_NUM}/${LABEL}" 2>/dev/null || true
launchctl unload "$PLIST_DEST" 2>/dev/null || true
rm -f "$PLIST_DEST"
rm -f "${HOME}/.local/bin/ppt-web-next-dev.sh"
rm -f "${HOME}/.local/bin/ppt-web-full-stack.sh"

if command -v lsof >/dev/null 2>&1; then
  for port in 3000 8000; do
    PIDS=$(lsof -ti ":${port}" 2>/dev/null || true)
    if [[ -n "${PIDS}" ]]; then
      echo "结束占用 ${port} 的进程: ${PIDS}"
      kill -9 ${PIDS} 2>/dev/null || true
    fi
  done
fi

echo "✓ 已卸载常驻任务（${LABEL}）。需要时可手动: npm run dev:stack 或 npm run dev:web（仅前端需另开后端）。"
