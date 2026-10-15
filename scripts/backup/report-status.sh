#!/usr/bin/env bash
# Durar · Tell the weekly digest how a job went: public.ops_report() (Phase 0.7 monitoring).
#   DB_URL=… scripts/backup/report-status.sh NAME true|false [DETAIL_JSON] [ISO_TIME]
# Numbers only in DETAIL_JSON. Skips quietly while the monitoring migration isn't in the database yet.
set -euo pipefail
name=${1:?usage: report-status.sh NAME true|false [DETAIL_JSON] [ISO_TIME]}
ok=${2:?missing true|false}
detail=${3:-'{}'}
at=${4:-}
: "${DB_URL:?DB_URL is not set}"
"$(dirname "$0")/mask-password.sh"
if [ "$(psql "$DB_URL" -X -qtA -c "select to_regprocedure('public.ops_report(text,boolean,jsonb,timestamptz)') is not null")" != t ]; then
  echo "public.ops_report() isn't in the database yet; $name not recorded."
  exit 0
fi
# psql fills in :'name' etc. (quoted safely) only in what it reads from stdin, not in -c.
psql "$DB_URL" -X -q -v ON_ERROR_STOP=1 -v VERBOSITY=terse -v name="$name" -v ok="$ok" -v detail="$detail" -v at="$at" \
  <<< "select public.ops_report(:'name', :'ok'::boolean, :'detail'::jsonb, nullif(:'at', '')::timestamptz);" > /dev/null
echo "Recorded for the weekly digest: $name $ok."
