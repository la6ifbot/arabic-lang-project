#!/usr/bin/env bash
# Durar · Upload an encrypted backup to the private backup bucket (Frankfurt) and verify it arrived.
#   BACKUP_BUCKET=… AWS_ACCESS_KEY_ID=… AWS_SECRET_ACCESS_KEY=… scripts/backup/upload.sh FILE
# The upload key may only add objects, so the check doesn't download anything: S3 computes the
# SHA-256 of what it received and refuses the upload unless it matches ours.
# Keys: daily/<UTC time>.tar.gz.age (kept 31 days by the bucket's lifecycle rule) and, on the first
# three days of each month, the same file as monthly/<YYYY-MM>.tar.gz.age (kept a year). Three days, so a
# failed night on the 1st still leaves a monthly; a later one replaces the earlier (the bucket keeps the replaced
# version for 7 days).
set -euo pipefail

file=${1:?usage: upload.sh FILE}
: "${BACKUP_BUCKET:?BACKUP_BUCKET is not set}"
export AWS_DEFAULT_REGION=eu-central-1
[ -z "${GITHUB_ACTIONS:-}" ] || echo "::add-mask::$BACKUP_BUCKET"

sum=$(openssl dgst -sha256 -binary "$file" | base64)
bytes=$(stat -c %s "$file")
if [ "$bytes" -lt 1024 ]; then
  echo "The backup is only $bytes bytes; not uploading it." >&2
  exit 1
fi

put() {
  local got
  got=$(aws s3api put-object --bucket "$BACKUP_BUCKET" --key "$1" --body "$file" \
    --checksum-algorithm SHA256 --checksum-sha256 "$sum" --query ChecksumSHA256 --output text)
  if [ "$got" != "$sum" ]; then
    echo "S3 reported a different checksum for $1." >&2
    exit 1
  fi
  echo "Uploaded and verified: $1 ($bytes bytes)."
}

put "daily/$(date -u +%Y-%m-%dT%H-%M-%SZ).tar.gz.age"
if [ "$(date -u +%d)" -le 3 ] || [ -n "${BACKUP_MONTHLY:-}" ]; then
  put "monthly/$(date -u +%Y-%m).tar.gz.age"
fi
