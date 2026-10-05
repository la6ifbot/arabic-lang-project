#!/usr/bin/env bash
# Durar · Tell Lativ a backup job failed: opens an issue (or comments on the open one with the same
# title). GitHub emails the repository's owner about new issues and comments, whoever last edited the
# workflow (GitHub's own failure email for scheduled runs goes to that person). The issue only links
# the run; the log itself holds no data.
#   GH_TOKEN=… scripts/backup/report-failure.sh "Nightly backup failed"
set -euo pipefail
title=${1:?usage: report-failure.sh TITLE}
run="$GITHUB_SERVER_URL/$GITHUB_REPOSITORY/actions/runs/$GITHUB_RUN_ID"
body="The run on $(date -u '+%-d %b %Y at %H:%M UTC') failed: $run

Its log says which step stopped. docs/OPERATIONS.md (Backups) has what to check. Close this issue once a run passes again."
number=$(gh issue list --repo "$GITHUB_REPOSITORY" --state open --search "\"$title\" in:title" --json number,title \
  --jq "map(select(.title == \"$title\"))[0].number // empty")
if [ -n "$number" ]; then
  gh issue comment "$number" --repo "$GITHUB_REPOSITORY" --body "$body"
else
  gh issue create --repo "$GITHUB_REPOSITORY" --title "$title" --body "$body" --assignee la6ifbot
fi
