#!/usr/bin/env bash
# 移除 API + Next 两个常驻任务
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$ROOT"
bash scripts/uninstall-api-launchagent.sh
bash scripts/uninstall-launchagent.sh
echo "✓ 已移除全部 ppt-web / API 常驻任务。"
