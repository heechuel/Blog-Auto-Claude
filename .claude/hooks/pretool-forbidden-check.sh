#!/usr/bin/env bash
# PreToolUse hook: blocks Write/Edit calls to draft.md or final.md that
# contain any phrase from .claude/style/forbidden-phrases.txt.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PHRASES_FILE="$SCRIPT_DIR/../style/forbidden-phrases.txt"

INPUT="$(cat)"
TOOL_NAME="$(jq -r '.tool_name // empty' <<< "$INPUT")"
FILE_PATH="$(jq -r '.tool_input.file_path // empty' <<< "$INPUT")"

case "$FILE_PATH" in
  *draft.md|*final.md) ;;
  *) exit 0 ;;
esac

CONTENT=""
case "$TOOL_NAME" in
  Write)
    CONTENT="$(jq -r '.tool_input.content // empty' <<< "$INPUT")"
    ;;
  Edit)
    CONTENT="$(jq -r '.tool_input.new_string // empty' <<< "$INPUT")"
    ;;
  *)
    exit 0
    ;;
esac

[ -z "$CONTENT" ] && exit 0
[ -f "$PHRASES_FILE" ] || exit 0

MATCHES="$(grep -n -F -f "$PHRASES_FILE" <<< "$CONTENT" || true)"

if [ -n "$MATCHES" ]; then
  {
    echo "금지 표현이 발견되어 저장을 막았습니다 ($FILE_PATH):"
    echo "$MATCHES"
    echo ""
    echo ".claude/style/forbidden-expressions.md 를 참고해서 표현을 바꾼 뒤 다시 저장하세요."
  } >&2
  exit 2
fi

exit 0
