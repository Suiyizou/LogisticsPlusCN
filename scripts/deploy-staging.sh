#!/usr/bin/env bash
# Isolated test deployment only. Does not invoke the production backup/restore scripts.
# Usage: bash scripts/deploy-staging.sh /absolute/root-ending-in-staging <full-sha>
set -euo pipefail
umask 077

STAGING_ROOT="${1:?staging root required}"
RELEASE_SHA="${2:?full commit SHA required}"
[[ "$RELEASE_SHA" =~ ^[0-9a-f]{40}$ ]] || { echo 'A full lowercase SHA is required' >&2; exit 2; }
[[ "$STAGING_ROOT" == /* && "$STAGING_ROOT" == *-staging && "$STAGING_ROOT" != *$'\n'* ]] || {
  echo 'Staging root must be an absolute path ending in -staging' >&2; exit 2;
}
[[ "$(realpath -m "$STAGING_ROOT")" == "$STAGING_ROOT" ]] || { echo 'Non-canonical staging path' >&2; exit 2; }
[[ -f "$STAGING_ROOT/.cargo-staging-owner" ]] || { echo 'Missing staging ownership marker' >&2; exit 2; }
[[ "$(cat "$STAGING_ROOT/.cargo-staging-owner")" == cargo-staging-v1 ]] || { echo 'Unexpected staging owner' >&2; exit 2; }
RELEASE_DIR="$STAGING_ROOT/releases/$RELEASE_SHA"
[[ "$(realpath -e "$RELEASE_DIR")" == "$RELEASE_DIR" ]] || { echo 'Invalid release directory' >&2; exit 2; }
[[ -f "$RELEASE_DIR/docker-compose.staging.yml" ]] || { echo 'Missing staging Compose override' >&2; exit 2; }
[[ "$(cat "$RELEASE_DIR/.release-sha")" == "$RELEASE_SHA" ]] || { echo 'Release metadata mismatch' >&2; exit 2; }
[[ ! -e "$STAGING_ROOT/current" || -L "$STAGING_ROOT/current" ]] || { echo 'current must be an owned symlink' >&2; exit 2; }

exec 9>"$STAGING_ROOT/deploy.lock"
flock -n 9 || { echo 'Another staging deployment is in progress' >&2; exit 3; }
exec > >(tee -a "$STAGING_ROOT/deploy.log") 2>&1
mkdir -p "$STAGING_ROOT/shared/shipment-files" "$STAGING_ROOT/backups"
ENV_FILE="$STAGING_ROOT/shared/staging.env"
if [[ ! -f "$ENV_FILE" ]]; then
  # Ubuntu's standard Python is only used for secret generation, not application runtime.
  python3 - "$ENV_FILE" "$STAGING_ROOT/shared/shipment-files" <<'PY'
import os, secrets, sys
path, uploads = sys.argv[1:]
password = 'Aa1!' + secrets.token_urlsafe(24)
values = {
 'MYSQL_DATABASE':'cargo_staging', 'MYSQL_USER':'cargo_staging',
 'MYSQL_PASSWORD':secrets.token_urlsafe(24), 'MYSQL_ROOT_PASSWORD':secrets.token_urlsafe(24),
 'FRONTEND_PORT':'18080', 'STAGING_FRONTEND_PORT':'18080',
 'APP_BOOTSTRAP_ADMIN_ENABLED':'true', 'APP_BOOTSTRAP_ADMIN_USERNAME':'staging_admin',
 'APP_BOOTSTRAP_ADMIN_PASSWORD':password, 'APP_BOOTSTRAP_ADMIN_DISPLAY_NAME':'Staging Administrator',
 'SPRING_FLYWAY_ENABLED':'true', 'APP_TRACKING_AUTO_REFRESH_ENABLED':'false',
 'TRACKING_ADAPTER_KEY':secrets.token_urlsafe(32), 'SHIPMENT_FILE_HOST_PATH':uploads,
}
with open(path, 'x', encoding='utf-8') as output:
 output.write(''.join(f'{key}={value}\n' for key, value in values.items()))
os.chmod(path, 0o600)
PY
fi

export IMAGE_TAG="staging-${RELEASE_SHA:0:12}"
export COMPOSE_PARALLEL_LIMIT=1
COMPOSE=(docker compose -p cargo-staging --project-directory "$RELEASE_DIR" --env-file "$ENV_FILE"
  -f "$RELEASE_DIR/docker-compose.yml" -f "$RELEASE_DIR/docker-compose.staging.yml")
"${COMPOSE[@]}" config --quiet
if [[ -n "$("${COMPOSE[@]}" ps -q mysql)" ]]; then
  BACKUP_DIR="$STAGING_ROOT/backups/$(date -u +%Y%m%dT%H%M%SZ)"
  mkdir "$BACKUP_DIR"
  "${COMPOSE[@]}" exec -T mysql sh -c 'exec mysqldump -uroot -p"$MYSQL_ROOT_PASSWORD" --single-transaction --routines --triggers "$MYSQL_DATABASE"' > "$BACKUP_DIR/db.sql"
  [[ -s "$BACKUP_DIR/db.sql" ]] || { echo 'Staging backup is empty' >&2; exit 1; }
  cp "$STAGING_ROOT/current/.release-sha" "$BACKUP_DIR/previous-sha" 2>/dev/null || true
  (cd "$BACKUP_DIR" && sha256sum db.sql > checksums.sha256 && sha256sum -c checksums.sha256)
fi

echo "[staging] Building $RELEASE_SHA; output is loopback-only port 18080"
for service in backend tracking frontend; do
  "${COMPOSE[@]}" build "$service"
done
"${COMPOSE[@]}" up -d --wait --wait-timeout 240
curl -fsS --retry 8 --retry-delay 3 --retry-connrefused http://127.0.0.1:18080/actuator/health >/dev/null
curl -fsS --retry 8 --retry-delay 3 --retry-connrefused http://127.0.0.1:18080/tracking/api/health >/dev/null
curl -fsS http://127.0.0.1:18080/ >/dev/null
for asset in favicon.svg favicon.ico icon-192.png site.webmanifest; do
  curl -fsS "http://127.0.0.1:18080/$asset" >/dev/null
done
ln -sfn "$RELEASE_DIR" "$STAGING_ROOT/current"
printf '%s\n' "$IMAGE_TAG" > "$STAGING_ROOT/current-image-tag"
echo "[staging] Healthy release $RELEASE_SHA at http://127.0.0.1:18080/"
