#!/bin/bash
# Next.js 前端常驻：由 launchd 调用，勿直接双击（无 PATH 时可能失败）
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
WEB="$ROOT/apps/web"
export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:$PATH"
cd "$WEB"
rm -f .next/dev/lock
exec npm run dev
