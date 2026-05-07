#!/usr/bin/env bash
# Superbuilder: deterministic block list for shell commands.
# Reads the PreToolUse JSON payload on stdin, denies hard-coded destructive
# commands. Anything ambiguous falls through to the prompt-based hook.

set -euo pipefail

input=$(cat)
tool_name=$(printf '%s' "$input" | jq -r '.tool_name // empty')

if [[ "$tool_name" != "Bash" ]]; then
  exit 0
fi

cmd=$(printf '%s' "$input" | jq -r '.tool_input.command // empty')

deny() {
  local reason="$1"
  jq -n --arg r "$reason" \
    '{hookSpecificOutput: {permissionDecision: "deny"}, systemMessage: $r}'
  exit 0
}

# Catastrophic filesystem
if [[ "$cmd" =~ rm[[:space:]]+(-[a-zA-Z]*r[a-zA-Z]*f|-[a-zA-Z]*f[a-zA-Z]*r)[[:space:]]+(/|\.|\$HOME|~)([[:space:]]|$) ]]; then
  deny "rm -rf against root, home, or cwd is blocked by Superbuilder."
fi

# Force pushes
if [[ "$cmd" =~ git[[:space:]]+push[[:space:]]+.*--force ]] || [[ "$cmd" =~ git[[:space:]]+push[[:space:]]+.*-f([[:space:]]|$) ]]; then
  deny "git push --force is blocked. Open a PR or request explicit approval."
fi
if [[ "$cmd" =~ git[[:space:]]+push[[:space:]]+--mirror ]]; then
  deny "git push --mirror is blocked."
fi

# Hard reset / clean on protected paths
if [[ "$cmd" =~ git[[:space:]]+reset[[:space:]]+--hard ]]; then
  deny "git reset --hard requires explicit human approval. Use git stash or a branch instead."
fi
if [[ "$cmd" =~ git[[:space:]]+clean[[:space:]]+-[a-zA-Z]*f ]]; then
  deny "git clean -f is blocked. Inspect untracked files first."
fi

# Skip safety
if [[ "$cmd" =~ --no-verify ]]; then
  deny "--no-verify (skipping hooks) is forbidden. Fix the underlying issue."
fi
if [[ "$cmd" =~ --no-gpg-sign ]] || [[ "$cmd" =~ commit\.gpgsign=false ]]; then
  deny "Bypassing commit signing is forbidden."
fi

# Deploy / publish surfaces
for pat in \
  'npm[[:space:]]+publish' \
  'pnpm[[:space:]]+publish' \
  'yarn[[:space:]]+publish' \
  'bun[[:space:]]+publish' \
  'vercel[[:space:]]+deploy[[:space:]]+--prod' \
  'railway[[:space:]]+up' \
  'fly[[:space:]]+deploy' \
  'cargo[[:space:]]+publish' \
  'twine[[:space:]]+upload' \
  'gh[[:space:]]+release[[:space:]]+create' \
  'kubectl[[:space:]]+delete[[:space:]]+namespace' \
  'kubectl[[:space:]]+apply[[:space:]]+.*production' \
  'terraform[[:space:]]+destroy' \
  'terraform[[:space:]]+apply[[:space:]]+.*-auto-approve' \
  'supabase[[:space:]]+db[[:space:]]+reset' \
  'dropdb' \
  'DROP[[:space:]]+DATABASE' \
  'TRUNCATE[[:space:]]+TABLE'
do
  if [[ "$cmd" =~ $pat ]]; then
    deny "Release/destructive action ($pat) requires explicit human approval. Use /superbuilder:supership."
  fi
done

# Secret exfiltration
if [[ "$cmd" =~ (cat|less|more|head|tail|bat)[[:space:]]+.*\.env(\b|$) ]]; then
  deny "Reading .env files is blocked. Use environment variables, not file dumps."
fi
if [[ "$cmd" =~ git[[:space:]]+add[[:space:]]+.*\.env ]]; then
  deny "Committing .env files is blocked."
fi

exit 0
