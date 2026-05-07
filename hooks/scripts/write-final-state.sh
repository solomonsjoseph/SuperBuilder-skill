#!/usr/bin/env bash
# At session end, snapshot prd.json story status into progress.md.

set -uo pipefail

root="${CLAUDE_PROJECT_DIR:-$PWD}/.superbuilder"
[[ -d "$root" ]] || exit 0
[[ -f "$root/prd.json" ]] || exit 0

ts=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
{
  printf '\n## Session end %s\n\n' "$ts"
  jq -r '.userStories[] | "- [\(if .passes then "x" else " " end)] \(.id) \(.title) (attempts=\(.attempts // 0))"' "$root/prd.json" 2>/dev/null || true
} >> "$root/progress.md" 2>/dev/null || true

exit 0
