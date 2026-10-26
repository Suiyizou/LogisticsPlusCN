#!/usr/bin/env bash
#
# 部署已通过 CI 验证的版本，并做线上冒烟检查。
#
# 用法:
#   scripts/deploy.sh [--ref <git-ref>] [--skip-backup] [--skip-build] [--image-tag <tag>]
#
# 关键顺序（对应复查 R02）:
#   1. 先记录“当前正在运行的版本” CURRENT_REF，并**在切换代码之前**完成备份；
#   2. 备份记录的是运行中版本的提交与镜像，而不是待部署的新版本；
#   3. 再 checkout 目标版本，得到 TARGET_REF；
#   4. 用不可变镜像标签（release-<时间>-<短SHA>）构建并启动；
#   5. 冒烟失败时，回滚指向 CURRENT_REF（旧版本）与本次备份目录。
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck source=lib/common.sh
. "$ROOT/scripts/lib/common.sh"

REF=""
IMAGE_TAG_ARG=""
DO_BACKUP=1
DO_BUILD=1
while [[ $# -gt 0 ]]; do
  case "$1" in
    --ref) REF="${2:?--ref requires a value}"; shift 2 ;;
    --image-tag) IMAGE_TAG_ARG="${2:?--image-tag requires a value}"; shift 2 ;;
    --skip-backup) DO_BACKUP=0; shift ;;
    --skip-build) DO_BUILD=0; shift ;;
    *) echo "unknown argument: $1" >&2; exit 2 ;;
  esac
done

COMPOSE=(docker compose --project-directory "$ROOT" -f "$ROOT/docker-compose.yml")
FRONTEND_PORT="$(dotenv_value FRONTEND_PORT 80)"

CURRENT_REF="$(git -C "$ROOT" rev-parse HEAD)"
CURRENT_BRANCH="$(git -C "$ROOT" rev-parse --abbrev-ref HEAD)"
echo "[deploy] current running version: $CURRENT_REF ($CURRENT_BRANCH)"

BACKUP_DIR=""
if [[ "$DO_BACKUP" == "1" ]]; then
  BACKUP_DIR="$ROOT/backups/$(date -u +%Y%m%dT%H%M%SZ)"
  echo "[deploy] backing up current version before switching code ..."
  "$ROOT/scripts/backup.sh" "$BACKUP_DIR"
fi

TARGET_REF="$CURRENT_REF"
if [[ -n "$REF" ]]; then
  echo "[deploy] switching code to $REF ..."
  git -C "$ROOT" fetch --tags --all
  git -C "$ROOT" checkout "$REF"
  TARGET_REF="$(git -C "$ROOT" rev-parse HEAD)"
fi

RELEASE_TAG="${IMAGE_TAG_ARG:-release-$(date -u +%Y%m%d%H%M%S)-$(git -C "$ROOT" rev-parse --short "$TARGET_REF")}"
export IMAGE_TAG="$RELEASE_TAG"
echo "[deploy] target=$TARGET_REF previous=$CURRENT_REF image_tag=$RELEASE_TAG"

if [[ -n "$BACKUP_DIR" ]]; then
  # The verified backup is immutable. Deployment metadata belongs beside it.
  RELEASE_MANIFEST="${BACKUP_DIR}.release.txt"
  {
    echo "release_commit=$TARGET_REF"
    echo "release_image_tag=$RELEASE_TAG"
    echo "previous_commit=$CURRENT_REF"
    echo "backup_dir=$BACKUP_DIR"
  } > "$RELEASE_MANIFEST"
  echo "[deploy] release manifest: $RELEASE_MANIFEST"
fi

if [[ "$DO_BUILD" == "1" ]]; then
  echo "[deploy] building images ($RELEASE_TAG) ..."
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
  echo "[deploy] success. release=$TARGET_REF image_tag=$RELEASE_TAG"
  echo "[deploy] rollback (if needed): scripts/rollback.sh $BACKUP_DIR --checkout $CURRENT_REF"
else
  echo "[deploy] 冒烟失败。回滚到旧版本 $CURRENT_REF:" >&2
  if [[ -n "$BACKUP_DIR" ]]; then
    echo "  scripts/rollback.sh $BACKUP_DIR --checkout $CURRENT_REF" >&2
  else
    echo "  scripts/rollback.sh <backup-dir> --checkout $CURRENT_REF" >&2
  fi
  exit 1
fi
