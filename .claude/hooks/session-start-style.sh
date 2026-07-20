#!/usr/bin/env bash
# SessionStart hook: injects the blog style guide into context automatically
# so the model doesn't have to remember to go read it.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
STYLE_DIR="$SCRIPT_DIR/../style"

CONTEXT="# 블로그 스타일 가이드 (SessionStart 훅 자동 주입)"$'\n'
CONTEXT+=$'\n'"블로그 글쓰기 파이프라인(researcher/planner/writer/reviewer/publisher)을 실행할 때 아래 규칙을 반드시 따르세요."$'\n'

for f in tone.md readability.md forbidden-expressions.md checklist.md; do
  fp="$STYLE_DIR/$f"
  if [ -f "$fp" ]; then
    CONTEXT+=$'\n'"---"$'\n'"## $f"$'\n\n'"$(cat "$fp")"$'\n'
  fi
done

jq -n --arg ctx "$CONTEXT" '{hookSpecificOutput: {hookEventName: "SessionStart", additionalContext: $ctx}}'
