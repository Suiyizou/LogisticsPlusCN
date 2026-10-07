#!/usr/bin/env bash
#
# 备份部署的数据库、文件、密钥、配置与版本信息。
#
# 用法:
#   scripts/backup.sh [目标目录]
# 默认目标目录: ./backups/<UTC 时间戳>
#
# 产物:
#   db.sql                  MySQL 全量导出（结构 + 数据 + 触发器/存储过程）
#   secrets.tgz             backend /app/secrets（加密密钥卷）
#   workspace-files.tgz     backend /app/uploads（工作区文件 + 公告图片）
#   shipment-files.tgz      宿主机票单文件目录（SHIPMENT_FILE_HOST_PATH）
#   version.txt             git 提交/分支/标签/镜像标签/时间
#   images.txt              当前容器 -> 镜像引用与镜像 ID（回滚定位旧镜像）
#   env.snapshot            .env 键名快照（值全部脱敏）
#   checksums.sha256        上述文件校验和
#
# 说明:
#   - .env 只按行读取，绝不 source（内容可能含空格/#/$）。见 scripts/lib/common.sh。
#   - 备份完成前会校验 checksums；校验失败视为备份失败。
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck source=lib/common.sh
. "$ROOT/scripts/lib/common.sh"

TARGET="${1:-$ROOT/backups/$(date -u +%Y%m%dT%H%M%SZ)}"
COMPOSE=(docker compose --project-directory "$ROOT" -f "$ROOT/docker-compose.yml")
mkdir -p "$TARGET"
echo "[backup] target: $TARGET"

echo "[backup] database ..."
"${COMPOSE[@]}" exec -T mysql sh -c \
  'exec mysqldump -uroot -p"$MYSQL_ROOT_PASSWORD" --single-transaction --routines --triggers "$MYSQL_DATABASE"' \
  > "$TARGET/db.sql"
require_nonempty_file "$TARGET/db.sql" "database dump"

echo "[backup] secrets volume ..."
"${COMPOSE[@]}" exec -T backend sh -c 'tar czf - -C /app/secrets .' > "$TARGET/secrets.tgz"
require_nonempty_file "$TARGET/secrets.tgz" "secrets archive"

echo "[backup] workspace files + announcement images ..."
"${COMPOSE[@]}" exec -T backend sh -c 'tar czf - -C /app/uploads .' > "$TARGET/workspace-files.tgz"
require_nonempty_file "$TARGET/workspace-files.tgz" "workspace-files archive"

SHIPMENT_DIR="$(shipment_files_dir)"
if [[ -n "$SHIPMENT_DIR" && -d "$SHIPMENT_DIR" ]]; then
  echo "[backup] shipment files: $SHIPMENT_DIR"
  tar czf "$TARGET/shipment-files.tgz" -C "$SHIPMENT_DIR" .
  require_nonempty_file "$TARGET/shipment-files.tgz" "shipment-files archive"
else
  echo "[backup] warn: 未找到票单文件目录（SHIPMENT_FILE_HOST_PATH=$SHIPMENT_DIR），跳过" >&2
fi

{
  echo "git_commit=$(git -C "$ROOT" rev-parse HEAD 2>/dev/null || echo unknown)"
  echo "git_branch=$(git -C "$ROOT" rev-parse --abbrev-ref HEAD 2>/dev/null || echo unknown)"
  echo "git_describe=$(git -C "$ROOT" describe --tags --always 2>/dev/null || echo unknown)"
  echo "image_tag=$(dotenv_value IMAGE_TAG "")"
  echo "backed_up_at=$(date -u +%Y-%m-%dT%H:%M:%SZ)"
} > "$TARGET/version.txt"

"${COMPOSE[@]}" ps -q 2>/dev/null | while read -r container_id; do
  [[ -n "$container_id" ]] || continue
  docker inspect --format \
    'container={{.Name}} image_ref={{.Config.Image}} image_id={{.Image}}' "$container_id"
done > "$TARGET/images.txt" 2>/dev/null || true

if [[ -f "$ROOT/.env" ]]; then
  sed -E 's/=.*/=<redacted>/' "$ROOT/.env" > "$TARGET/env.snapshot"
fi

write_checksums "$TARGET"
verify_checksums "$TARGET"
echo "[backup] done + verified:"
ls -lh "$TARGET"
