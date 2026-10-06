#!/usr/bin/env bash
# Durar · Apply supabase/migrations to a database, as .github/workflows/migrations.yml does.
#   DB_URL=postgresql://… scripts/db/migrate.sh [--baseline] [--dry-run]
# Supabase keeps a history table (supabase_migrations.schema_migrations) and applies only the files
# it doesn't list yet, each in its own transaction.
# --baseline (production): if the database has no history yet, its earlier migrations were applied
#   by hand. supabase/baseline-check.sql checks which are really there; those marked ok are recorded
#   as applied, and the rest are applied as usual. Stops, changing nothing, on MISSING or PARTIAL.
set -euo pipefail

baseline=''
dry=''
for arg in "$@"; do
  case $arg in
    --baseline) baseline=1 ;;
    --dry-run) dry=1 ;;
    *) echo "Unknown option $arg" >&2; exit 2 ;;
  esac
done
: "${DB_URL:?DB_URL is not set}"
root=$(cd "$(dirname "$0")/../.." && pwd)
cd "$root"
"$root/scripts/backup/mask-password.sh"

has_history=$(psql "$DB_URL" -X -qtA -c "select to_regclass('supabase_migrations.schema_migrations') is not null")

if [ "$has_history" != t ] && [ -n "$baseline" ]; then
  echo "No migration history yet: checking the migrations applied by hand."
  report=$(psql "$DB_URL" -X -qtA -F ': ' -f supabase/baseline-check.sql)
  printf '%s\n' "$report" | grep -E '^[0-9]{14} ' || true
  if grep -qE ': (MISSING|PARTIAL)$' <<< "$report"; then
    echo "Production lacks something a hand-applied migration should have made (MISSING or PARTIAL above)." >&2
    echo "Nothing was changed. See docs/OPERATIONS.md (Migrations)." >&2
    exit 1
  fi
  mapfile -t versions < <(printf '%s\n' "$report" | sed -nE 's/^([0-9]{14}) .*: ok$/\1/p')
  for v in "${versions[@]}"; do
    [ -n "$(ls supabase/migrations/"$v"_*.sql 2>/dev/null)" ] || { echo "Production has $v, but this branch has no such file." >&2; exit 1; }
  done
  if [ -n "$dry" ]; then
    echo "Would record ${#versions[@]} migrations as already applied: ${versions[*]}"
  else
    supabase migration repair --db-url "$DB_URL" --status applied "${versions[@]}"
    echo "Recorded ${#versions[@]} migrations as already applied."
  fi
elif [ "$has_history" != t ]; then
  echo "No migration history yet: every migration will be applied."
fi

if [ -n "$dry" ]; then
  if [ "$has_history" != t ] && [ -n "$baseline" ]; then
    echo "Then would apply every migration after those."
  else
    supabase db push --db-url "$DB_URL" --dry-run
  fi
else
  supabase db push --db-url "$DB_URL" --yes
fi
