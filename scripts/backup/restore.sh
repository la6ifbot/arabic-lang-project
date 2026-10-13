#!/usr/bin/env bash
# Durar · Restore an encrypted backup (docs/OPERATIONS.md, "Restoring a backup").
#   scripts/backup/restore.sh BACKUP.tar.gz.age KEY_FILE TARGET_DB_URL [--table schema.table] [--keep-cron]
#
# Everything (default): roles, schema and data go in as one transaction, the way Supabase documents
# it, into an empty Supabase project. Scheduled jobs come back paused unless --keep-cron is given, so
# a copy never starts sending the daily email.
# --table: replaces one table's rows with the backup's, in one transaction. Nothing else is touched.
#
# Then every table's row count is compared with the backup's counts.tsv (only for the restored table
# with --table). Error messages are printed without the values they quote and without psql's
# detail lines, because those can contain people's data and workflow logs are public.
set -euo pipefail
umask 077

backup=${1:?usage: restore.sh BACKUP KEY_FILE TARGET_DB_URL [--table schema.table] [--keep-cron]}
key=${2:?missing KEY_FILE}
export TARGET_DB_URL=${3:?missing TARGET_DB_URL}
shift 3
table=''
keep_cron=''
while [ $# -gt 0 ]; do
  case $1 in
    --table) table=${2:?--table needs schema.table}; shift 2 ;;
    --keep-cron) keep_cron=1; shift ;;
    *) echo "Unknown option $1" >&2; exit 2 ;;
  esac
done
here=$(cd "$(dirname "$0")" && pwd)
"$here/mask-password.sh" TARGET_DB_URL

work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
start=$(date +%s)

age -d -i "$key" "$backup" | tar -C "$work" -xzf -

run_psql() {
  # Terse errors: one line, no DETAIL/CONTEXT. Quoted values in it are blanked out.
  if ! PGOPTIONS='-c client_min_messages=warning' psql "$TARGET_DB_URL" -X -q -v ON_ERROR_STOP=1 -v VERBOSITY=terse \
      "$@" > "$work/psql.log" 2>&1; then
    sed -E 's/"[^"]*"/"…"/g; s/\([^)]*\)=\([^)]*\)/(…)=(…)/g' "$work/psql.log" | grep -E 'ERROR|FATAL' | head -n 3 >&2
    echo "The restore stopped; nothing was changed (it runs as one transaction)." >&2
    exit 1
  fi
}

# Only pg_cron's own function may change a job (the table itself is read-only to postgres on Supabase).
pause_cron="do \$\$ begin if to_regclass('cron.job') is not null then perform cron.alter_job(jobid, active := false) from cron.job; end if; end \$\$;"

if [ -z "$table" ]; then
  extra=()
  [ -n "$keep_cron" ] || extra=(-c "$pause_cron")
  run_psql --single-transaction -f "$work/roles.sql" -f "$work/schema.sql" \
    -c 'SET session_replication_role = replica' -f "$work/data.sql" "${extra[@]}"
else
  quoted=$(printf '%s' "$table" | sed -E 's/^([^.]+)\.(.+)$/"\1"."\2"/')
  if ! grep -q "^$(printf '%s' "$quoted" | sed 's/\./\\./g')"$'\t' "$work/counts.tsv"; then
    echo "The backup has no table $table." >&2
    exit 1
  fi
  # This table's COPY block, from its COPY line to the "\." that ends it.
  awk -v t="$quoted" '$1 == "COPY" && $2 == t {on=1} on {print} on && /^\\\.$/ {exit}' "$work/data.sql" > "$work/table.sql"
  # Under the replica role, triggers and foreign-key checks are off, as in the full restore.
  run_psql --single-transaction -c 'SET session_replication_role = replica' -c "delete from $quoted" -f "$work/table.sql"
  grep "^$(printf '%s' "$quoted" | sed 's/\./\\./g')"$'\t' "$work/counts.tsv" > "$work/counts.only"
  mv "$work/counts.only" "$work/counts.tsv"
fi
restored=$(date +%s)

# Compare row counts. Only table names and "matches"/"differs" are printed.
tables=0
bad=0
while IFS=$'\t' read -r name rows; do
  got=$(psql "$TARGET_DB_URL" -X -qtA -c "select count(*) from $name" 2>/dev/null || echo missing)
  tables=$((tables + 1))
  if [ "$got" != "$rows" ]; then
    echo "Row count differs: $name" >&2
    bad=$((bad + 1))
  fi
done < "$work/counts.tsv"

if [ "$bad" -gt 0 ]; then
  echo "$bad of $tables tables differ from the backup." >&2
  exit 1
fi
[ "$tables" = 1 ] && matched="the table matches" || matched="all $tables tables match"
echo "Restored and checked: $matched the backup's row counts. Restore $((restored - start)) s, check $(($(date +%s) - restored)) s."
