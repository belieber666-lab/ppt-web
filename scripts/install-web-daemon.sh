#!/bin/bash
# 安装「前端一直开着」：写入 ~/Library/LaunchAgents 并立即启动
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
RUNNER="$ROOT/scripts/run-web-dev-daemon.sh"
LABEL="com.pptweb.frontend"
AGENTS="$HOME/Library/LaunchAgents"
PLIST="$AGENTS/${LABEL}.plist"
LOG_DIR="$ROOT/.logs"
mkdir -p "$AGENTS" "$LOG_DIR"
chmod +x "$RUNNER"

# 先停掉旧任务（兼容新旧 macOS）
launchctl bootout "gui/$(id -u)" "$PLIST" 2>/dev/null || true
launchctl unload "$PLIST" 2>/dev/null || true

cat > "$PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${LABEL}</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/bash</string>
    <string>${RUNNER}</string>
  </array>
  <key>WorkingDirectory</key>
  <string>${ROOT}/apps/web</string>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>ThrottleInterval</key>
  <integer>10</integer>
  <key>StandardOutPath</key>
  <string>${LOG_DIR}/web-dev.stdout.log</string>
  <key>StandardErrorPath</key>
  <string>${LOG_DIR}/web-dev.stderr.log</string>
</dict>
</plist>
EOF

if launchctl bootstrap "gui/$(id -u)" "$PLIST" 2>/dev/null; then
  echo "已用 launchctl bootstrap 启动 ${LABEL}"
elif launchctl load "$PLIST" 2>/dev/null; then
  echo "已用 launchctl load 启动 ${LABEL}"
else
  echo "launchctl 启动失败，请手动执行: launchctl load $PLIST"
  exit 1
fi

echo "完成。网站应在数秒内可访问: http://localhost:3000"
echo "日志: $LOG_DIR/web-dev.stdout.log"
echo "卸载常驻: cd \"$ROOT\" && npm run daemon:web:uninstall"
