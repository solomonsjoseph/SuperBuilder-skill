#!/usr/bin/env bash
# At session start, surface the current Superbuilder state so the agent
# resumes from .superbuilder/ instead of starting fresh.

set -uo pipefail

root="${CLAUDE_PROJECT_DIR:-$PWD}/.superbuilder"

if [[ ! -d "$root" ]]; then
  exit 0
fi

msg=""
if [[ -f "$root/prd.json" ]]; then
  proj=$(jq -r '.project // "unknown"' "$root/prd.json" 2>/dev/null || echo "unknown")
  done_n=$(jq '[.userStories[]? | select(.passes == true)] | length' "$root/prd.json" 2>/dev/null || echo 0)
  total=$(jq '.userStories | length' "$root/prd.json" 2>/dev/null || echo 0)
  msg+="Superbuilder state detected for project '$proj': $done_n/$total stories passed. "
fi
if [[ -f "$root/progress.md" ]]; then
  msg+="Resume by reading .superbuilder/progress.md and .superbuilder/prd.json before any new planning."
fi

if [[ -n "$msg" ]]; then
  jq -n --arg m "$msg" '{systemMessage: $m, suppressOutput: true, continue: true}'
fi

exit 0
