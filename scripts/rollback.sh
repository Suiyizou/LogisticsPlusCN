#!/usr/bin/env bash
#
# 按已演练方案回滚到某个备份目录记录的版本。
#
# 用法:
#   scripts/rollback.sh <backup-dir> [--db-only] [--checkout <ref>]
#
# 步骤:
#   1. (可选) git checkout 备份记录的提交/标签
#   2. 恢复数据库 db.sql
#   3. 恢复 backend /app/secrets 密钥卷
#   4. 重建并重启（除非 --db-only）
#   5. 冒烟检查
#
# 注意:
#   - 恢复数据库会覆盖当前库内容，请先确认已再次备份当前状态。
#   - 本脚本不删除任何卷；只覆盖数据库与密钥。
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKUP_DIR="${1:?usage: rollback.sh <backup-dir> [--db-only] [--checkout <ref>]}"
shift
DB_ONLY=0
CHECKOUT=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --db-only) DB_ONLY=1; shift ;;
    --checkout) CHECKOUT="${2:?--checkout requires a value}"; shift 2 ;;
    *) echo "unknown argument: $1" >&2; exit 2 ;;
  esac
done

[[ -f "$BACKUP_DIR/db.sql" ]] || { echo "[rollback] missing $BACKUP_DIR/db.sql" >&2; exit 1; }

COMPOSE=(docker compose --project-directory "$ROOT" -f "$ROOT/docker-compose.yml")
if [[ -f "$ROOT/.env" ]]; then
  set -a
  # shellcheck disable=SC1091
  . "$ROOT/.env"
  set +a
fi
FRONTEND_PORT="${FRONTEND_PORT:-80}"

if [[ -n "$CHECKOUT" ]]; then
  echo "[rollback] checking out $CHECKOUT ..."
  git -C "$ROOT" fetch --tags --all
  git -C "$ROOT" checkout "$CHECKOUT"
elif [[ -f "$BACKUP_DIR/version.txt" ]]; then
  echo "[rollback] backup version:"; cat "$BACKUP_DIR/version.txt"
fi

echo "[rollback] restoring database ..."
"${COMPOSE[@]}" exec -T mysql sh -c \
  'exec mysql -uroot -p"$MYSQL_ROOT_PASSWORD" "$MYSQL_DATABASE"' < "$BACKUP_DIR/db.sql"

if [[ -f "$BACKUP_DIR/secrets.tgz" ]]; then
  echo "[rollback] restoring backend secrets ..."
  "${COMPOSE[@]}" exec -T backend sh -c 'cat > /tmp/secrets.tgz && tar xzf /tmp/secrets.tgz -C /app/secrets && rm -f /tmp/secrets.tgz' \
    < "$BACKUP_DIR/secrets.tgz"
fi

if [[ "$DB_ONLY" == "1" ]]; then
  echo "[rollback] db-only: restarting backend to reload state ..."
  "${COMPOSE[@]}" restart backend
else
  echo "[rollback] recreating services ..."
  "${COMPOSE[@]}" up -d --wait
fi

for _ in $(seq 1 20); do
  if curl -fsS -o /dev/null "http://127.0.0.1:${FRONTEND_PORT}/actuator/health"; then
    echo "[rollback] smoke ok"
    exit 0
  fi
  sleep 3
done
echo "[rollback] smoke FAILED; check container logs" >&2
exit 1
