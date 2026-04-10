#!/usr/bin/env bash
# 一键安装：登录后自动启动 API(8000) + Next(3000)，打开浏览器即可用
# 在仓库根目录执行: npm run daemon:install
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$ROOT"

UID_NUM="$(id -u)"

# (a) 移除旧版前端 LaunchAgent，避免与 com.ppt-web.next 争用 3000
LEGACY_LABEL="com.pptweb.frontend"
LEGACY_PLIST="${HOME}/Library/LaunchAgents/${LEGACY_LABEL}.plist"
if [[ -f "$LEGACY_PLIST" ]]; then
  echo "移除旧版 LaunchAgent ${LEGACY_LABEL}（避免端口 3000 冲突）..."
  launchctl bootout "gui/${UID_NUM}/${LEGACY_LABEL}" 2>/dev/null || true
  launchctl unload "$LEGACY_PLIST" 2>/dev/null || true
  rm -f "$LEGACY_PLIST"
fi

# (b)(c) 安装 API 与 Next 的 LaunchAgent
bash scripts/install-api-launchagent.sh
bash scripts/install-launchagent.sh

# (d) 立即拉起，无需重新登录
launchctl kickstart -k "gui/${UID_NUM}/com.ppt-style-transfer.api" 2>/dev/null || true
launchctl kickstart -k "gui/${UID_NUM}/com.ppt-web.next" 2>/dev/null || true

# (e) 短暂等待后可选健康检查（失败不阻断安装）
echo ""
echo "等待服务就绪并检测端口..."
sleep 5
check_url() {
  local url="$1"
  local name="$2"
  if curl -sf --max-time 5 -o /dev/null "$url"; then
    echo "  ✓ ${name} 可访问: ${url}"
  else
    echo "  （提示）${name} 暂未响应，首轮编译或依赖加载可能较慢，请查看 ${ROOT}/.logs/"
  fi
}
check_url "http://127.0.0.1:8000/api/health" "API :8000"
check_url "http://127.0.0.1:3000/" "Next :3000"

echo ""
echo "======== 已全部就绪 ========"
echo "  安装命令（本仓库根目录）: npm run daemon:install"
echo "  前端: http://127.0.0.1:3000"
echo "  接口: http://127.0.0.1:8000/api/health"
echo "  日志: $ROOT/.logs/"
echo "  卸载: npm run daemon:uninstall"
echo "==========================="
