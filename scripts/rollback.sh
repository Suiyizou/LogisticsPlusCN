#!/usr/bin/env bash
#
# 回滚到某个已校验备份目录记录的版本。
#
# 用法:
#   scripts/rollback.sh <backup-dir> [--db-only] [--checkout <ref>] [--image-tag <tag>]
#
# 关键顺序（对应复查 R03/R05）:
#   1. 先校验备份 checksums；校验失败直接退出，不动生产；
#   2. 完整恢复先停 backend/tracking/frontend；--db-only 只停 backend，不切换代码/镜像；
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

if [[ "$DB_ONLY" == "1" && ( -n "$CHECKOUT" || -n "$IMAGE_TAG_ARG" ) ]]; then
  echo "[rollback] --db-only cannot change code or image tags" >&2
  exit 2
fi

[[ -d "$BACKUP_DIR" ]] || { echo "[rollback] 备份目录不存在: $BACKUP_DIR" >&2; exit 1; }
verify_checksums "$BACKUP_DIR"
require_nonempty_file "$BACKUP_DIR/db.sql" "database dump"
if [[ "$DB_ONLY" == "0" ]]; then
  require_nonempty_file "$BACKUP_DIR/secrets.tgz" "secrets archive"
  require_nonempty_file "$BACKUP_DIR/workspace-files.tgz" "workspace-files archive"
fi

COMPOSE=(docker compose --project-directory "$ROOT" -f "$ROOT/docker-compose.yml")
FRONTEND_PORT="$(dotenv_value FRONTEND_PORT 80)"

read_version_field() {
  local key="$1"
  [[ -f "$BACKUP_DIR/version.txt" ]] || return 0
  grep -E "^${key}=" "$BACKUP_DIR/version.txt" | tail -n 1 | cut -d= -f2- || true
}

if [[ "$DB_ONLY" == "0" ]]; then
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

  RESTORE_TAG="$IMAGE_TAG_ARG"
  if [[ -z "$RESTORE_TAG" && -s "$BACKUP_DIR/images.txt" ]]; then
    # Actual container references also repair older backups whose version.txt
    # copied a stale .env tag. Both old container= and new service= rows work.
    for image in cargo-planner-backend cargo-platform-tracking cargo-planner-frontend; do
      recorded_ref="$(awk -v prefix="image_ref=$image:" \
        '{ for (i=1; i<=NF; i++) if (index($i, prefix)==1) print substr($i, 11) }' \
        "$BACKUP_DIR/images.txt")"
      recorded_tag="${recorded_ref#"$image":}"
      [[ -n "$recorded_ref" && "$recorded_ref" != *$'\n'* && -n "$recorded_tag" \
        && ( -z "$RESTORE_TAG" || "$RESTORE_TAG" == "$recorded_tag" ) ]] || {
        echo "[rollback] incomplete or mixed release references in images.txt; provide a verified --image-tag explicitly" >&2
        exit 1
      }
      RESTORE_TAG="$recorded_tag"
    done
  fi
  [[ -n "$RESTORE_TAG" ]] || RESTORE_TAG="$(read_version_field image_tag)"
  HAVE_IMAGES=1
  if [[ -z "$RESTORE_TAG" ]]; then
    HAVE_IMAGES=0
  else
    for image in cargo-planner-backend cargo-platform-tracking cargo-planner-frontend; do
      if ! docker image inspect "${image}:${RESTORE_TAG}" >/dev/null 2>&1; then
        HAVE_IMAGES=0
      fi
    done
  fi
  export IMAGE_TAG="${RESTORE_TAG:-rollback-$(git -C "$ROOT" rev-parse --short HEAD)}"
  if [[ "$HAVE_IMAGES" == "1" ]]; then
    echo "[rollback] reusing recorded images: $IMAGE_TAG"
  else
    echo "[rollback] recorded images unavailable; rebuilding old code as $IMAGE_TAG"
    "${COMPOSE[@]}" build
  fi
fi

if [[ "$DB_ONLY" == "1" ]]; then
  echo "[rollback] stopping database writer (backend); keeping tracking/frontend running ..."
  "${COMPOSE[@]}" stop backend
else
  echo "[rollback] stopping writers (backend/tracking/frontend) ..."
  "${COMPOSE[@]}" stop backend tracking frontend
fi
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
  # The backend image has a Java ENTRYPOINT; override it for archive restoration.
  "${COMPOSE[@]}" run --rm --no-deps -T --entrypoint sh "$service" -c \
    "mkdir -p '$path' && tar xzf - -C '$path'" < "$archive"
}

if [[ "$DB_ONLY" == "0" ]]; then
  restore_into_volume backend /app/secrets "$BACKUP_DIR/secrets.tgz" "密钥卷"
  restore_into_volume backend /app/uploads "$BACKUP_DIR/workspace-files.tgz" "工作区文件与公告图片"

  SHIPMENT_DIR="$(shipment_files_dir)"
  if [[ -s "$BACKUP_DIR/shipment-files.tgz" && -n "$SHIPMENT_DIR" ]]; then
    echo "[rollback] restoring shipment files: $SHIPMENT_DIR"
    mkdir -p "$SHIPMENT_DIR"
    tar xzf "$BACKUP_DIR/shipment-files.tgz" -C "$SHIPMENT_DIR"
  fi
fi

if [[ "$DB_ONLY" == "1" ]]; then
  # Start the existing container; `up` could recreate it with a different image/config.
  echo "[rollback] db-only: starting backend to reload state ..."
  "${COMPOSE[@]}" start backend
else
  "${COMPOSE[@]}" up -d --wait
fi

for _ in $(seq 1 20); do
  if curl -fsS -o /dev/null "http://127.0.0.1:${FRONTEND_PORT}/actuator/health" \
     && curl -fsS -o /dev/null "http://127.0.0.1:${FRONTEND_PORT}/tracking/api/health"; then
    echo "[rollback] smoke ok"
    exit 0
  fi
  sleep 3
done
echo "[rollback] smoke FAILED; check container logs" >&2
exit 1
