#!/usr/bin/env bash
# SubagentStop hook: verifies the subagent that just finished actually left
# behind its expected pipeline output file. If not, blocks the subagent from
# returning so it has to go back and produce it.
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

INPUT="$(cat)"
AGENT_TYPE="$(jq -r '.agent_type // empty' <<< "$INPUT")"

expected=""
case "$AGENT_TYPE" in
  blog-researcher) expected="research.md" ;;
  blog-planner) expected="plan.md" ;;
  blog-writer) expected="draft.md" ;;
  blog-reviewer) expected="final.md" ;;
  blog-publisher) expected="blog-url.txt" ;;
  *) exit 0 ;;
esac

TARGET_PATH="$REPO_ROOT/$RUN_DIR/$expected"

if [ ! -s "$TARGET_PATH" ]; then
  echo "$AGENT_TYPE 단계 산출물($RUN_DIR/$expected)이 없거나 비어 있습니다. 작업을 마치고 파일을 저장한 뒤 종료하세요." >&2
  exit 2
fi

exit 0
