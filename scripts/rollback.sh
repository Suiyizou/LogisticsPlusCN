#!/usr/bin/env bash
#
# 按已演练方案回滚到某个备份目录记录的版本。
#
# 用法:
#   scripts/rollback.sh <backup-dir> [--db-only] [--checkout <ref>] [--image-tag <tag>]
#
# 关键顺序（对应复查 R03/R05）:
#   1. 先校验备份 checksums；校验失败直接退出，不动生产；
#   2. 先停写（backend/tracking/frontend），只保留 MySQL；
#   3. 恢复数据库 -> 密钥卷 -> 工作区/公告文件 -> 宿主机票单文件；
#   4. 使用备份记录的旧镜像标签启动；旧镜像不存在时，checkout 旧代码后重新构建；
#   5. 冒烟检查。
#
# 说明:
#   - 恢复数据库会覆盖当前库内容；执行前请再次备份当前状态。
#   - 不删除任何卷；只覆盖数据库与文件内容。
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck source=lib/common.sh
. "$ROOT/scripts/lib/common.sh"

BACKUP_DIR="${1:?usage: rollback.sh <backup-dir> [--db-only] [--checkout <ref>] [--image-tag <tag>]}"
shift
DB_ONLY=0
CHECKOUT=""
IMAGE_TAG_ARG=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --db-only) DB_ONLY=1; shift ;;
    --checkout) CHECKOUT="${2:?--checkout requires a value}"; shift 2 ;;
    --image-tag) IMAGE_TAG_ARG="${2:?--image-tag requires a value}"; shift 2 ;;
    *) echo "unknown argument: $1" >&2; exit 2 ;;
  esac
done

[[ -d "$BACKUP_DIR" ]] || { echo "[rollback] 备份目录不存在: $BACKUP_DIR" >&2; exit 1; }
verify_checksums "$BACKUP_DIR"
require_nonempty_file "$BACKUP_DIR/db.sql" "database dump"

COMPOSE=(docker compose --project-directory "$ROOT" -f "$ROOT/docker-compose.yml")
FRONTEND_PORT="$(dotenv_value FRONTEND_PORT 80)"

read_version_field() {
  local key="$1"
  [[ -f "$BACKUP_DIR/version.txt" ]] || return 0
  grep -E "^${key}=" "$BACKUP_DIR/version.txt" | tail -n 1 | cut -d= -f2- || true
}

RESTORE_REF="$CHECKOUT"
[[ -n "$RESTORE_REF" ]] || RESTORE_REF="$(read_version_field git_commit)"
if [[ -n "$RESTORE_REF" && "$RESTORE_REF" != "unknown" ]]; then
  CURRENT="$(git -C "$ROOT" rev-parse HEAD)"
  if [[ "$RESTORE_REF" != "$CURRENT" ]]; then
    echo "[rollback] checkout restore code: $RESTORE_REF"
    git -C "$ROOT" fetch --tags --all || true
    git -C "$ROOT" checkout "$RESTORE_REF"
  fi
fi

echo "[rollback] stopping writers (backend/tracking/frontend) ..."
"${COMPOSE[@]}" stop backend tracking frontend || true
"${COMPOSE[@]}" up -d mysql --wait || "${COMPOSE[@]}" up -d mysql

echo "[rollback] restoring database ..."
"${COMPOSE[@]}" exec -T mysql sh -c \
  'exec mysql -uroot -p"$MYSQL_ROOT_PASSWORD" "$MYSQL_DATABASE"' < "$BACKUP_DIR/db.sql"
"${COMPOSE[@]}" exec -T mysql sh -c \
  'exec mysql -uroot -p"$MYSQL_ROOT_PASSWORD" -N -e "SELECT 1"' >/dev/null
echo "[rollback] database restored and reachable"

restore_into_volume() {
  local service="$1" path="$2" archive="$3" label="$4"
  if [[ ! -s "$archive" ]]; then
    echo "[rollback] warn: 缺少 $label 归档，跳过" >&2
    return 0
  fi
  echo "[rollback] restoring $label ..."
  "${COMPOSE[@]}" run --rm --no-deps -T "$service" sh -c \
    "mkdir -p '$path' && tar xzf - -C '$path'" < "$archive"
}

if [[ "$DB_ONLY" == "0" ]]; then
  restore_into_volume backend /app/secrets "$BACKUP_DIR/secrets.tgz" "密钥卷"

  SHIPMENT_DIR="$(shipment_files_dir)"
  if [[ -s "$BACKUP_DIR/shipment-files.tgz" && -n "$SHIPMENT_DIR" ]]; then
    echo "[rollback] restoring shipment files: $SHIPMENT_DIR"
    mkdir -p "$SHIPMENT_DIR"
    tar xzf "$BACKUP_DIR/shipment-files.tgz" -C "$SHIPMENT_DIR"
  fi
fi

RESTORE_TAG="$IMAGE_TAG_ARG"
[[ -n "$RESTORE_TAG" ]] || RESTORE_TAG="$(read_version_field image_tag)"

if [[ "$DB_ONLY" == "1" ]]; then
  echo "[rollback] db-only: restarting backend to reload state ..."
  "${COMPOSE[@]}" restart backend
else
  if [[ -n "$RESTORE_TAG" ]] \
     && docker image inspect "cargo-planner-backend:${RESTORE_TAG}" >/dev/null 2>&1; then
    export IMAGE_TAG="$RESTORE_TAG"
    echo "[rollback] reusing recorded images: $RESTORE_TAG"
  else
    export IMAGE_TAG="${RESTORE_TAG:-rollback-$(git -C "$ROOT" rev-parse --short HEAD)}"
    echo "[rollback] recorded image unavailable; rebuilding old code as $IMAGE_TAG"
    "${COMPOSE[@]}" build
  fi
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
