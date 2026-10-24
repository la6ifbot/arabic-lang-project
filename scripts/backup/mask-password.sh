#!/usr/bin/env bash
# GitHub hides a secret in logs only where it appears whole. A database URL's password could also
# show up on its own (in a tool's error message, or percent-decoded), so hide those forms too.
# Does nothing outside GitHub Actions. Reads DB_URL, or the URLs named as arguments.
# Stops, without printing the URL, if it isn't one psql can use, so no tool gets to echo it.
set -euo pipefail
[ -n "${GITHUB_ACTIONS:-}" ] || exit 0
for name in "${@:-DB_URL}"; do
  NAME=$name URL=${!name:-} node -e '
    const { NAME: name, URL: raw } = process.env;
    if (!raw) process.exit(0);
    const stop = (why) => {
      console.error(`${name} ${why} Use a password of letters and digits only. See docs/OPERATIONS.md (Backups).`);
      process.exit(1);
    };
    let u;
    try { u = new URL(raw); } catch { stop("is not a connection string (postgresql://user:password@host:5432/postgres)."); }
    if (["localhost", "127.0.0.1"].includes(u.hostname)) process.exit(0); // a throwaway local database
    const mask = (v) => { if (v.length >= 4) console.log("::add-mask::" + v); };
    mask(u.password);
    let plain;
    try { plain = decodeURIComponent(u.password); } catch {
      stop("has a password with a % sign in it, which a connection string reads as a code.");
    }
    if (plain !== u.password) mask(plain);
    if (!plain) stop("has no password in it.");
    if (plain.includes("YOUR-PASSWORD")) stop("still says [YOUR-PASSWORD] where the password should be.");'
done
