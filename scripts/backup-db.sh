#!/bin/bash
# Katmitra database backup script
# Reads DATABASE_URL from the backend .env and dumps to /Users/harsh/Documents/Tolo/backups/

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="$SCRIPT_DIR/../.env"
BACKUP_DIR="/Users/harsh/Documents/Tolo/backups"
PG_DUMP="/opt/homebrew/opt/libpq/bin/pg_dump"

# Load DATABASE_URL from .env
if [ ! -f "$ENV_FILE" ]; then
  echo "[Backup] ERROR: .env not found at $ENV_FILE"
  exit 1
fi

DATABASE_URL=$(grep -E '^DIRECT_URL=' "$ENV_FILE" | head -1 | cut -d'=' -f2- | tr -d '"' | tr -d "'")

if [ -z "$DATABASE_URL" ]; then
  DATABASE_URL=$(grep -E '^DATABASE_URL=' "$ENV_FILE" | head -1 | cut -d'=' -f2- | tr -d '"' | tr -d "'")
fi

if [ -z "$DATABASE_URL" ]; then
  echo "[Backup] ERROR: Could not read DATABASE_URL from .env"
  exit 1
fi

mkdir -p "$BACKUP_DIR"

TIMESTAMP=$(date +%Y-%m-%d_%H-%M-%S)
BACKUP_FILE="$BACKUP_DIR/katmitra_$TIMESTAMP.sql"

echo "[Backup] Starting backup at $TIMESTAMP ..."

"$PG_DUMP" "$DATABASE_URL" \
  --no-password \
  --format=plain \
  --no-owner \
  --no-acl \
  > "$BACKUP_FILE"

# Compress the backup
gzip "$BACKUP_FILE"
BACKUP_FILE="$BACKUP_FILE.gz"

SIZE=$(du -sh "$BACKUP_FILE" | cut -f1)
echo "[Backup] Done. File: $BACKUP_FILE ($SIZE)"

# Keep only the last 7 backups — delete older ones
cd "$BACKUP_DIR"
ls -t katmitra_*.sql.gz 2>/dev/null | tail -n +8 | xargs -r rm --
echo "[Backup] Cleanup done. Kept last 7 backups."
