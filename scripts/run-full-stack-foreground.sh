#!/usr/bin/env bash
# 终端前台运行：后端 + Next（不配 launchd 时用）
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

API_PID=""
cleanup() {
  if [[ -n "${API_PID}" ]] && kill -0 "${API_PID}" 2>/dev/null; then
    kill "${API_PID}" 2>/dev/null || true
    wait "${API_PID}" 2>/dev/null || true
  fi
}
trap cleanup EXIT INT TERM HUP

shopt -s nullglob
SP=("${BACKEND_DIR}/venv/lib/python"*/site-packages)
if [[ ${#SP[@]} -eq 0 ]]; then
  echo "未找到 venv: $BACKEND_DIR" >&2
  exit 1
fi
export PYTHONPATH="${SP[0]}"
cd "${BACKEND_DIR}"
/usr/bin/python3 -m uvicorn main:app --host 0.0.0.0 --port 8000 &
API_PID=$!

for i in $(seq 1 90); do
  if curl -sf --connect-timeout 1 http://127.0.0.1:8000/api/health >/dev/null 2>&1; then
    break
  fi
  if ! kill -0 "${API_PID}" 2>/dev/null; then
    echo "后端启动失败" >&2
    exit 1
  fi
  sleep 1
done

cd "${WEB_DIR}"
rm -f .next/dev/lock
npm run dev
