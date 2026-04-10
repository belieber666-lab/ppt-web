#!/usr/bin/env bash
# 安装 macOS 用户守护进程：登录后自动启动「后端 8000 + Next 3000」（同一进程树，避免只开前端）
# 启动器在 ~/.local/bin，避免从「文稿」直接 exec 被拒
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
WEB_DIR="${REPO_ROOT}/apps/web"
BACKEND_PATH_FILE="${REPO_ROOT}/.backend-path"
if [[ -f "$BACKEND_PATH_FILE" ]]; then
  BACKEND_DIR="$(cd "$(head -1 "$BACKEND_PATH_FILE" | tr -d '\r\n')" && pwd)"
else
  BACKEND_DIR="$(cd "$REPO_ROOT/../../ppt-style-transfer/backend" && pwd)"
fi

if [[ ! -d "$BACKEND_DIR" ]]; then
  echo "错误: 未找到后端目录: $BACKEND_DIR"
  echo "请在 ppt-web 目录创建 .backend-path，第一行为 backend 绝对路径；或保持 ppt-style-transfer 与 openclaw安装 同级。"
  exit 1
fi
shopt -s nullglob
SP_CHECK=("${BACKEND_DIR}/venv/lib/python"*/site-packages)
if [[ ${#SP_CHECK[@]} -eq 0 ]]; then
  echo "错误: 未找到 venv site-packages: $BACKEND_DIR"
  exit 1
fi
shopt -u nullglob

LABEL="com.ppt-web.next"
PLIST_DEST="${HOME}/Library/LaunchAgents/${LABEL}.plist"
LOG_DIR="${REPO_ROOT}/.logs"
LAUNCHER="${HOME}/.local/bin/ppt-web-full-stack.sh"

mkdir -p "${HOME}/.local/bin" "$LOG_DIR"

cat > "$LAUNCHER" <<EOF
#!/bin/bash
set -euo pipefail
export HOME="${HOME}"
export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:\${PATH}"
unset npm_config_prefix NPM_CONFIG_PREFIX globalconfig 2>/dev/null || true
BACKEND_DIR="${BACKEND_DIR}"
WEB_DIR="${WEB_DIR}"
API_PID=""

cleanup() {
  if [[ -n "\${API_PID}" ]] && kill -0 "\${API_PID}" 2>/dev/null; then
    kill "\${API_PID}" 2>/dev/null || true
    wait "\${API_PID}" 2>/dev/null || true
  fi
}
trap cleanup EXIT INT TERM HUP

if ! command -v npm >/dev/null 2>&1; then
  export NVM_DIR="\${HOME}/.nvm"
  if [[ -s "\${NVM_DIR}/nvm.sh" ]]; then
    source "\${NVM_DIR}/nvm.sh"
    nvm use default --silent 2>/dev/null || true
  fi
fi

shopt -s nullglob
SP=("${BACKEND_DIR}/venv/lib/python"*/site-packages)
if [[ \${#SP[@]} -eq 0 ]]; then
  echo "未找到 backend venv site-packages: \${BACKEND_DIR}" >&2
  exit 1
fi
export PYTHONPATH="\${SP[0]}"
cd "\${BACKEND_DIR}"
/usr/bin/python3 -m uvicorn main:app --host 0.0.0.0 --port 8000 &
API_PID=\$!

for i in \$(seq 1 90); do
  if curl -sf --connect-timeout 1 http://127.0.0.1:8000/api/health >/dev/null 2>&1; then
    break
  fi
  if ! kill -0 "\${API_PID}" 2>/dev/null; then
    echo "后端进程异常退出，见日志" >&2
    exit 1
  fi
  sleep 1
done

cd "\${WEB_DIR}"
rm -f .next/dev/lock
npm run dev
EOF
chmod +x "$LAUNCHER"
xattr -cr "$LAUNCHER" 2>/dev/null || true

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
  <key>StandardOutPath</key>
  <string>${LOG_DIR}/ppt-stack.out.log</string>
  <key>StandardErrorPath</key>
  <string>${LOG_DIR}/ppt-stack.err.log</string>
</dict>
</plist>
EOF

UID_NUM="$(id -u)"
launchctl bootout "gui/${UID_NUM}/${LABEL}" 2>/dev/null || true
launchctl unload "$PLIST_DEST" 2>/dev/null || true

if launchctl bootstrap "gui/${UID_NUM}" "$PLIST_DEST" 2>/dev/null; then
  echo "✓ 已用 launchctl bootstrap 加载"
else
  launchctl load "$PLIST_DEST"
  echo "✓ 已用 launchctl load 加载"
fi

launchctl kickstart -k "gui/${UID_NUM}/${LABEL}" 2>/dev/null || true

echo ""
echo "ppt-web 一体化常驻已配置（先起 API:8000，再起 Next:3000）。"
echo "  启动器: ${LAUNCHER}"
echo "  前端:   http://localhost:3000（接口经 /api-backend 转发到 8000）"
echo "  日志:   ${LOG_DIR}/ppt-stack.out.log"
echo ""
echo "卸载: cd \"${REPO_ROOT}\" && npm run daemon:uninstall"
