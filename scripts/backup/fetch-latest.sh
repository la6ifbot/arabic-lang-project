#!/usr/bin/env bash
# Durar · Download the newest daily backup (still encrypted) from the backup bucket.
#   BACKUP_BUCKET=… AWS_ACCESS_KEY_ID=… AWS_SECRET_ACCESS_KEY=… scripts/backup/fetch-latest.sh OUT_FILE
# Needs the restore-test user's read access. Stops if the newest backup is more than two days old,
# because then the nightly backup has stopped working.
set -euo pipefail
out=${1:?usage: fetch-latest.sh OUT_FILE}
: "${BACKUP_BUCKET:?BACKUP_BUCKET is not set}"
export AWS_DEFAULT_REGION=eu-central-1
[ -z "${GITHUB_ACTIONS:-}" ] || echo "::add-mask::$BACKUP_BUCKET"

read -r key modified < <(aws s3api list-objects-v2 --bucket "$BACKUP_BUCKET" --prefix daily/ \
  --query 'sort_by(Contents, &LastModified)[-1].[Key, LastModified]' --output text)
if [ -z "${key:-}" ] || [ "$key" = None ]; then
  echo "The bucket has no daily backups yet." >&2
  exit 1
fi
hours=$(( ($(date +%s) - $(date -d "$modified" +%s)) / 3600 ))
echo "Newest backup: $key ($hours hours old)."
if [ "$hours" -gt 48 ]; then
  echo "That is more than two days old: the nightly backup isn't working." >&2
  exit 1
fi
aws s3api get-object --bucket "$BACKUP_BUCKET" --key "$key" "$out" > /dev/null
