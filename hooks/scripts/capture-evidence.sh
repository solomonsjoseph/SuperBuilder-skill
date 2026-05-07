#!/usr/bin/env bash
# Append Bash invocation + result to .superbuilder/evidence/_session.log so
# stories can later attach proof. Best-effort only; never blocks.

set -uo pipefail

input=$(cat)

dir="${CLAUDE_PROJECT_DIR:-$PWD}/.superbuilder/evidence"
mkdir -p "$dir" 2>/dev/null || exit 0

ts=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
{
  printf '\n--- %s ---\n' "$ts"
  printf '%s\n' "$input" | jq -c '{cmd: .tool_input.command, result: (.tool_result // null)}' 2>/dev/null \
    || printf '%s\n' "$input"
} >> "$dir/_session.log" 2>/dev/null || true

exit 0
