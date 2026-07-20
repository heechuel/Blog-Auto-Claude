#!/usr/bin/env bash
# Stop hook: while a blog-pipeline run is in_progress, refuses to let the
# session end until final.md and blog-url.txt both exist. Auto-expires stale
# runs so a crashed/abandoned pipeline can't block unrelated future sessions.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
STATE_FILE="$REPO_ROOT/.claude/state/current-run.json"
STALE_AFTER_SECONDS=7200

[ -f "$STATE_FILE" ] || exit 0

STATUS="$(jq -r '.status // empty' "$STATE_FILE")"
[ "$STATUS" = "in_progress" ] || exit 0

STARTED_AT="$(jq -r '.started_at // empty' "$STATE_FILE")"
if [ -n "$STARTED_AT" ]; then
  NOW_EPOCH="$(date +%s)"
  STARTED_EPOCH="$(date -d "$STARTED_AT" +%s 2>/dev/null || echo "$NOW_EPOCH")"
  AGE=$(( NOW_EPOCH - STARTED_EPOCH ))
  if [ "$AGE" -gt "$STALE_AFTER_SECONDS" ]; then
    jq '.status = "abandoned"' "$STATE_FILE" > "$STATE_FILE.tmp" && mv "$STATE_FILE.tmp" "$STATE_FILE"
    exit 0
  fi
fi

RUN_DIR="$(jq -r '.run_dir // empty' "$STATE_FILE")"
[ -n "$RUN_DIR" ] || exit 0

FINAL_MD="$REPO_ROOT/$RUN_DIR/final.md"
URL_FILE="$REPO_ROOT/$RUN_DIR/blog-url.txt"

MISSING=()
[ -s "$FINAL_MD" ] || MISSING+=("final.md")
[ -s "$URL_FILE" ] || MISSING+=("blog-url.txt (블로그 URL)")

if [ "${#MISSING[@]}" -gt 0 ]; then
  echo "블로그 파이프라인이 아직 끝나지 않았습니다. 누락: ${MISSING[*]}. 완료하고 나서 종료하세요." >&2
  exit 2
fi

exit 0
