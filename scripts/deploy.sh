#!/usr/bin/env bash
#
# 部署已通过 CI 验证的版本，并做线上冒烟检查。
#
# 用法:
#   scripts/deploy.sh [--ref <git-ref>] [--skip-backup] [--skip-build]
#
# 步骤:
#   1. 可选: git fetch + checkout <ref>（默认使用当前工作区）
#   2. 备份数据库 / 密钥 / 版本（调用 scripts/backup.sh）
#   3. docker compose build
#   4. docker compose up -d --wait（等待健康检查）
#   5. 冒烟: 前端 /actuator/health、追踪 /tracking/api/health
#
# 失败时不会自动回滚；脚本会打印回滚命令，交由人工确认。
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REF=""
DO_BACKUP=1
DO_BUILD=1
while [[ $# -gt 0 ]]; do
  case "$1" in
    --ref) REF="${2:?--ref requires a value}"; shift 2 ;;
    --skip-backup) DO_BACKUP=0; shift ;;
    --skip-build) DO_BUILD=0; shift ;;
    *) echo "unknown argument: $1" >&2; exit 2 ;;
  esac
done

COMPOSE=(docker compose --project-directory "$ROOT" -f "$ROOT/docker-compose.yml")
if [[ -f "$ROOT/.env" ]]; then
  set -a
  # shellcheck disable=SC1091
  . "$ROOT/.env"
  set +a
fi
FRONTEND_PORT="${FRONTEND_PORT:-80}"

if [[ -n "$REF" ]]; then
  echo "[deploy] checking out $REF ..."
  git -C "$ROOT" fetch --tags --all
  git -C "$ROOT" checkout "$REF"
fi

PREVIOUS_REF="$(git -C "$ROOT" rev-parse HEAD)"
echo "[deploy] deploying commit $PREVIOUS_REF"

BACKUP_DIR=""
if [[ "$DO_BACKUP" == "1" ]]; then
  BACKUP_DIR="$("$ROOT/scripts/backup.sh" | awk -F': ' '/target:/ {print $2}' | tail -1)"
  [[ -n "$BACKUP_DIR" ]] || { echo "[deploy] backup failed" >&2; exit 1; }
  echo "[deploy] backup at $BACKUP_DIR"
fi

if [[ "$DO_BUILD" == "1" ]]; then
  echo "[deploy] building images ..."
  "${COMPOSE[@]}" build
fi

echo "[deploy] starting services ..."
"${COMPOSE[@]}" up -d --wait

smoke() {
  local url="$1" name="$2" attempts="${3:-20}"
  for _ in $(seq 1 "$attempts"); do
    if curl -fsS -o /dev/null "$url"; then
      echo "[deploy] smoke ok: $name ($url)"
      return 0
    fi
    sleep 3
  done
  echo "[deploy] smoke FAILED: $name ($url)" >&2
  return 1
}

if smoke "http://127.0.0.1:${FRONTEND_PORT}/actuator/health" "backend via nginx" \
   && smoke "http://127.0.0.1:${FRONTEND_PORT}/tracking/api/health" "tracking via nginx"; then
  echo "[deploy] success. commit=$PREVIOUS_REF"
else
  echo "[deploy] 冒烟失败。回滚命令:" >&2
  if [[ -n "$BACKUP_DIR" ]]; then
    echo "  scripts/rollback.sh $BACKUP_DIR --checkout $PREVIOUS_REF" >&2
  else
    echo "  scripts/rollback.sh <backup-dir> --checkout $PREVIOUS_REF" >&2
  fi
  exit 1
fi
