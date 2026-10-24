#!/usr/bin/env bash
# Durar · Dump the database the way Supabase documents it, and encrypt the dump.
#   DB_URL=postgresql://… scripts/backup/make-backup.sh OUT_FILE
# OUT_FILE is an age-encrypted .tar.gz holding roles.sql, schema.sql, data.sql (sign-in accounts
# included) and counts.tsv (rows per table, read from data.sql, for the restore test). It is locked to
# the public keys in supabase/backup/recipients.txt (or BACKUP_RECIPIENTS). The plain dump only ever
# exists in a private temporary folder that is deleted on exit, and nothing from it is printed: the
# repository is public, and so are its workflow logs.
set -euo pipefail
umask 077

out=${1:?usage: make-backup.sh OUT_FILE}
: "${DB_URL:?DB_URL is not set}"
here=$(cd "$(dirname "$0")" && pwd)
recipients=${BACKUP_RECIPIENTS:-$here/../../supabase/backup/recipients.txt}

if ! grep -q '^age1' "$recipients"; then
  echo "No public keys in $recipients yet: see docs/OPERATIONS.md (Backups)." >&2
  exit 1
fi
"$here/mask-password.sh"

work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT

start=$(date +%s)
supabase db dump --db-url "$DB_URL" --role-only -f "$work/roles.sql"
supabase db dump --db-url "$DB_URL" -f "$work/schema.sql"
supabase db dump --db-url "$DB_URL" --data-only --use-copy -f "$work/data.sql"

# One line per table: "schema"."table" <tab> rows. COPY text format keeps each row on one line.
awk '/^COPY /{t=$2; n=0; inside=1; next} inside && /^\\\.$/{print t "\t" n; inside=0; next} inside{n++}' \
  "$work/data.sql" > "$work/counts.tsv"
if ! grep -q '^"auth"."users"' "$work/counts.tsv" || ! grep -q '^"public"\.' "$work/counts.tsv"; then
  echo "The data dump has no sign-in accounts or no public tables; stopping." >&2
  exit 1
fi

tar -C "$work" -czf - roles.sql schema.sql data.sql counts.tsv | age -R "$recipients" -o "$out"
echo "Backup made and encrypted: $(wc -l < "$work/counts.tsv") tables, $(stat -c %s "$out") bytes, $(($(date +%s) - start)) s."
