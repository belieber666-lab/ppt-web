#!/usr/bin/env bash
# 一键安装：卸掉「独立 API 常驻」后，只保留「一体化」常驻（8000+3000 同启）
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$ROOT"

echo "=== 准备：卸掉独立 API 常驻（避免与一体化争用 8000）==="
bash scripts/uninstall-api-launchagent.sh 2>/dev/null || true

echo "=== 准备：卸掉旧版仅前端的常驻 ==="
bash scripts/uninstall-web-daemon.sh 2>/dev/null || true

echo "=== 安装一体化常驻（先 API 后 Next，默认 .backend-path 可改后端路径）==="
bash scripts/install-launchagent.sh

UID_NUM="$(id -u)"
echo ""
echo "=== 立即拉起服务 ==="
launchctl kickstart -k "gui/${UID_NUM}/com.ppt-web.next" 2>/dev/null || true

echo ""
echo "=== 健康检查（最多约 90 秒，含 Next 首次编译）==="
ok=0
for i in $(seq 1 45); do
  if curl -sf --connect-timeout 2 "http://127.0.0.1:3000/api-backend/api/health" >/dev/null 2>&1; then
    ok=1
    break
  fi
  sleep 2
done

if [[ "$ok" -eq 1 ]]; then
  echo "✓ 通过 http://127.0.0.1:3000/api-backend 已能访问后端（同源代理正常）。"
  echo ""
  echo "请只用浏览器打开: http://localhost:3000"
  echo "日志: ${ROOT}/.logs/ppt-stack.out.log / ppt-stack.err.log"
  exit 0
fi

echo "检查未通过。请查看: ${ROOT}/.logs/ppt-stack.err.log"
echo "若端口被占: npm run daemon:uninstall:all 后重试 npm run daemon:install:all"
exit 1
