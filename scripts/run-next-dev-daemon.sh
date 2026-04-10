#!/usr/bin/env bash
# 由 launchd 调用：常驻运行 Next 开发服务器（不依赖 Cursor / 终端窗口）
set -euo pipefail
REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT/apps/web"

rm -f .next/dev/lock

export NVM_DIR="${HOME}/.nvm"
if [[ -s "${NVM_DIR}/nvm.sh" ]]; then
  # shellcheck source=/dev/null
  source "${NVM_DIR}/nvm.sh"
fi
export PATH="/opt/homebrew/bin:/usr/local/bin:${PATH}"

exec npm run dev
