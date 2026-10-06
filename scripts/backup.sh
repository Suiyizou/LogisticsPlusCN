#!/usr/bin/env bash
#
# 备份线上/本地部署的数据、文件、密钥与版本信息。
#
# 用法:
#   scripts/backup.sh [目标目录]
# 默认目标目录: ./backups/<UTC 时间戳>
#
# 产物:
#   db.sql         MySQL 全量导出（结构 + 数据 + 触发器/存储过程）
#   secrets.tgz    backend 容器 /app/secrets 下的加密密钥卷
#   version.txt    git 提交、分支/标签、compose 镜像版本
#   env.snapshot   当前 .env 的键集合（脱敏，只记录键名，不记录值）
#
# 说明:
#   - 需要 Docker 引擎可用的部署环境；本地未启动 Docker 时无法执行。
#   - 不会把密码打印到终端；导出文件包含敏感数据，请仅保存在受控目录，
#     .gitignore 已忽略 backups/。
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TARGET="${1:-$ROOT/backups/$(date -u +%Y%m%dT%H%M%SZ)}"
COMPOSE=(docker compose --project-directory "$ROOT" -f "$ROOT/docker-compose.yml")

if [[ -f "$ROOT/.env" ]]; then
  set -a
  # shellcheck disable=SC1091
  . "$ROOT/.env"
  set +a
fi

mkdir -p "$TARGET"
echo "[backup] target: $TARGET"

echo "[backup] dumping database ..."
"${COMPOSE[@]}" exec -T mysql sh -c \
  'exec mysqldump -uroot -p"$MYSQL_ROOT_PASSWORD" --single-transaction --routines --triggers "$MYSQL_DATABASE"' \
  > "$TARGET/db.sql"

echo "[backup] archiving backend secrets volume ..."
"${COMPOSE[@]}" exec -T backend sh -c 'tar czf - -C /app/secrets .' \
  > "$TARGET/secrets.tgz"

{
  echo "git_commit=$(git -C "$ROOT" rev-parse HEAD 2>/dev/null || echo unknown)"
  echo "git_describe=$(git -C "$ROOT" describe --tags --always 2>/dev/null || echo unknown)"
  echo "git_branch=$(git -C "$ROOT" rev-parse --abbrev-ref HEAD 2>/dev/null || echo unknown)"
  echo "backed_up_at=$(date -u +%Y-%m-%dT%H:%M:%SZ)"
} > "$TARGET/version.txt"

if [[ -f "$ROOT/.env" ]]; then
  # 只记录键名，避免把密钥复制进备份清单。
  sed -E 's/=.*/=<redacted>/' "$ROOT/.env" > "$TARGET/env.snapshot"
fi

echo "[backup] done:"
ls -lh "$TARGET"
