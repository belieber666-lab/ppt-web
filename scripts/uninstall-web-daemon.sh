#!/bin/bash
set -euo pipefail
LABEL="com.pptweb.frontend"
PLIST="$HOME/Library/LaunchAgents/${LABEL}.plist"
launchctl bootout "gui/$(id -u)" "$PLIST" 2>/dev/null || true
launchctl unload "$PLIST" 2>/dev/null || true
rm -f "$PLIST"
echo "已移除 ${LABEL}。3000 端口上的 Next 会随进程结束而停止。"
