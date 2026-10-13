#!/usr/bin/env bash
# Durar · Start an empty local Supabase (Docker) to restore a backup into, then throw it away.
#   scripts/backup/throwaway-supabase.sh DIR          start it; its database is
#                                                     postgresql://postgres:postgres@127.0.0.1:54322/postgres
#   scripts/backup/throwaway-supabase.sh DIR --stop   stop it and delete everything in it
# It uses the repository's supabase/config.toml (same Postgres version as production) but has no
# migrations and no seed data: the backup brings the schema and the data. Sign-in (GoTrue) and
# Storage run, so the auth and storage tables exist and are as current as on a hosted project.
set -euo pipefail
dir=${1:?usage: throwaway-supabase.sh DIR [--stop]}
if [ "${2:-}" = --stop ]; then
  [ -d "$dir/supabase" ] && supabase stop --no-backup --workdir "$dir" > /dev/null 2>&1 || true
  rm -rf "$dir"
  exit 0
fi
here=$(cd "$(dirname "$0")" && pwd)
mkdir -p "$dir/supabase"
sed -e 's/^project_id = .*/project_id = "restore-target"/' "$here/../../supabase/config.toml" \
  | awk '/^\[db.seed\]|^\[storage\]/{print; print ($0 ~ /storage/ ? "enabled = true" : "enabled = false"); skip=1; next}
         skip && /^(enabled|sql_paths)/{next} /^\[/{skip=0} {print}' \
  > "$dir/supabase/config.toml"
supabase start --workdir "$dir" -x studio,imgproxy,mailpit,realtime,edge-runtime,logflare,vector,postgres-meta > /dev/null
echo "Throwaway Supabase is up."
