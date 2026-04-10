#!/usr/bin/env bash
# 一键卸载 API + Next 常驻（含旧版 com.pptweb.frontend，若有）
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$ROOT"

UID_NUM="$(id -u)"
LEGACY_LABEL="com.pptweb.frontend"
LEGACY_PLIST="${HOME}/Library/LaunchAgents/${LEGACY_LABEL}.plist"
if [[ -f "$LEGACY_PLIST" ]]; then
  echo "移除旧版 LaunchAgent ${LEGACY_LABEL}..."
  launchctl bootout "gui/${UID_NUM}/${LEGACY_LABEL}" 2>/dev/null || true
  launchctl unload "$LEGACY_PLIST" 2>/dev/null || true
  rm -f "$LEGACY_PLIST"
fi

bash scripts/uninstall-api-launchagent.sh
bash scripts/uninstall-launchagent.sh

echo "✓ 已卸载全部常驻（8000 + 3000）。"
echo "  在仓库根目录可再次安装: npm run daemon:install"
