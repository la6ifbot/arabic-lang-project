#!/usr/bin/env bash
# GitHub hides a secret in logs only where it appears whole. A database URL's password could also
# show up on its own (in a tool's error message, or percent-decoded), so hide those forms too.
# Does nothing outside GitHub Actions. Reads DB_URL, or the URLs named as arguments.
set -euo pipefail
[ -n "${GITHUB_ACTIONS:-}" ] || exit 0
for name in "${@:-DB_URL}"; do
  URL=${!name:-} node -e '
    const raw = process.env.URL;
    if (!raw) process.exit(0);
    const u = new URL(raw);
    if (["localhost", "127.0.0.1"].includes(u.hostname)) process.exit(0); // a throwaway local database
    for (const v of new Set([u.password, decodeURIComponent(u.password)])) {
      if (v.length >= 4) console.log("::add-mask::" + v);
    }'
done
