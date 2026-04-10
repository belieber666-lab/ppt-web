#!/usr/bin/env bash
# 登录后自动启动 ppt-style-transfer 后端（0.0.0.0:8000），解决前端「Failed to fetch」
# 启动器放在 ~/.local/bin，避免从「文稿」路径直接 exec 被拒
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
BACKEND_PATH_FILE="${REPO_ROOT}/.backend-path"
if [[ -f "$BACKEND_PATH_FILE" ]]; then
  BACKEND_DIR="$(cd "$(head -1 "$BACKEND_PATH_FILE" | tr -d '\r\n')" && pwd)"
else
  BACKEND_DIR="$(cd "$REPO_ROOT/../../ppt-style-transfer/backend" && pwd)"
fi
LABEL="com.ppt-style-transfer.api"
PLIST_DEST="${HOME}/Library/LaunchAgents/${LABEL}.plist"
LOG_DIR="${REPO_ROOT}/.logs"
LAUNCHER="${HOME}/.local/bin/ppt-style-transfer-api.sh"

if [[ ! -d "$BACKEND_DIR" ]]; then
  echo "错误: 未找到后端目录: $BACKEND_DIR"
  echo "请确认 ppt-style-transfer 与 openclaw安装 同级（均在「文稿」下）。"
  exit 1
fi
shopt -s nullglob
SP_CHECK=("${BACKEND_DIR}/venv/lib/python"*/site-packages)
if [[ ${#SP_CHECK[@]} -eq 0 ]]; then
  echo "错误: 未找到 venv site-packages，请在 backend 目录创建 venv 并安装依赖: $BACKEND_DIR"
  exit 1
fi
shopt -u nullglob

mkdir -p "${HOME}/.local/bin" "$LOG_DIR"

# 使用系统 /usr/bin/python3 + PYTHONPATH，避免 launchd 下 venv/bin/python 读 pyvenv.cfg 触发「文稿」目录权限问题
cat > "$LAUNCHER" <<EOF
#!/bin/bash
set -euo pipefail
export HOME="${HOME}"
export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:\${PATH}"
cd "${BACKEND_DIR}"
shopt -s nullglob
SP=("${BACKEND_DIR}/venv/lib/python"*/site-packages)
if [[ \${#SP[@]} -eq 0 ]]; then
  echo "未找到 venv site-packages" >&2
  exit 1
fi
export PYTHONPATH="\${SP[0]}"
exec /usr/bin/python3 -m uvicorn main:app --host 0.0.0.0 --port 8000
EOF
chmod +x "$LAUNCHER"
xattr -cr "$LAUNCHER" 2>/dev/null || true

UID_NUM="$(id -u)"
launchctl bootout "gui/${UID_NUM}/${LABEL}" 2>/dev/null || true
launchctl unload "$PLIST_DEST" 2>/dev/null || true

cat > "$PLIST_DEST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${LABEL}</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/bash</string>
    <string>${LAUNCHER}</string>
  </array>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>ThrottleInterval</key>
  <integer>5</integer>
  <key>StandardOutPath</key>
  <string>${LOG_DIR}/api-dev.stdout.log</string>
  <key>StandardErrorPath</key>
  <string>${LOG_DIR}/api-dev.stderr.log</string>
</dict>
</plist>
EOF

if launchctl bootstrap "gui/${UID_NUM}" "$PLIST_DEST" 2>/dev/null; then
  echo "✓ 已用 launchctl bootstrap 加载 ${LABEL}"
else
  launchctl load "$PLIST_DEST"
  echo "✓ 已用 launchctl load 加载 ${LABEL}"
fi

launchctl kickstart -k "gui/${UID_NUM}/${LABEL}" 2>/dev/null || true

echo "完成。数秒后应可访问: http://127.0.0.1:8000/api/health"
echo "日志: $LOG_DIR/api-dev.stdout.log"
echo "卸载: cd \"$REPO_ROOT\" && npm run daemon:api:uninstall"
