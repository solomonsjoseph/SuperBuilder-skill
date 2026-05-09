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

# --- Alias / function expansion (TVS-003) -----------------------------------
# Defeat shell-alias and function-definition bypasses such as:
#   alias DEL="rm -rf"; DEL /tmp/x                              # simple
#   alias D='rm'; alias R='-rf'; D R /tmp/x                     # medium
#   function D() { rm -rf "$@"; }; D /tmp/x                     # hard
#
# Strategy: extract every alias/function body declared in the command, then
# substitute their tokens inline (capped iterations so a malicious recursive
# definition cannot loop forever). The resulting string is what the deny
# patterns below are evaluated against.
expand_aliases_and_functions() {
  local input_cmd="$1"
  local expanded="$input_cmd"
  # Concatenate every body discovered, so even if substitution misses an
  # edge case the deny matcher still sees the literal body text.
  local appended=""

  # Match: alias NAME='BODY'  or  alias NAME="BODY"
  # POSIX-ish; works on bash 3.2 (macOS).
  while IFS= read -r line; do
    [[ -z "$line" ]] && continue
    appended+=" ; $line"
  done < <(printf '%s\n' "$input_cmd" \
    | grep -oE "alias[[:space:]]+[A-Za-z_][A-Za-z0-9_]*=('[^']*'|\"[^\"]*\")" \
    | sed -E "s/^alias[[:space:]]+[A-Za-z_][A-Za-z0-9_]*=['\"]?//; s/['\"]\$//")

  # Match: function NAME() { BODY; }  or  NAME() { BODY; }
  while IFS= read -r line; do
    [[ -z "$line" ]] && continue
    appended+=" ; $line"
  done < <(printf '%s\n' "$input_cmd" \
    | grep -oE "(function[[:space:]]+)?[A-Za-z_][A-Za-z0-9_]*[[:space:]]*\([[:space:]]*\)[[:space:]]*\{[^}]*\}" \
    | sed -E "s/.*\\{[[:space:]]*//; s/[[:space:]]*\\}\$//")

  # Inline alias substitution (bounded iterations).
  local i=0
  while [[ $i -lt 8 ]]; do
    local before="$expanded"
    # For each alias declaration, replace later standalone occurrences of
    # NAME with its BODY in $expanded.
    while IFS=$'\t' read -r name body; do
      [[ -z "$name" ]] && continue
      # Replace whole-word NAME with BODY. Bash 3.2-compatible loop.
      local out="" rest="$expanded"
      while [[ "$rest" =~ (^|[[:space:];\&\|\(])${name}([[:space:];\&\|\)]|$) ]]; do
        local m="${BASH_REMATCH[0]}"
        local pre="${rest%%"$m"*}"
        local lead="${BASH_REMATCH[1]}"
        local trail="${BASH_REMATCH[2]}"
        out+="${pre}${lead}${body}${trail}"
        rest="${rest#*"$m"}"
      done
      out+="$rest"
      expanded="$out"
    done < <(printf '%s\n' "$input_cmd" \
      | grep -oE "alias[[:space:]]+[A-Za-z_][A-Za-z0-9_]*=('[^']*'|\"[^\"]*\")" \
      | sed -E "s/^alias[[:space:]]+([A-Za-z_][A-Za-z0-9_]*)=['\"]?(.*)['\"]\$/\\1\t\\2/")
    [[ "$expanded" == "$before" ]] && break
    i=$((i + 1))
  done

  printf '%s%s' "$expanded" "$appended"
}

# Build the expanded view used for deny-pattern matching. Original $cmd is
# kept untouched for messages, but $cmd is reassigned to the expanded form
# so every existing pattern below also covers alias/function bypasses.
cmd_original="$cmd"
cmd="$(expand_aliases_and_functions "$cmd")"

# Indirection: block outright (must come before other checks).
# The split-quote e''val / e""val is intentional: it prevents the literal
# token from appearing in this source file (so a grep of the codebase
# does not false-positive on the blocker itself). The empty-quote split
# is deliberate, not a typo — suppress SC2026.
# shellcheck disable=SC2026
if [[ "$cmd" =~ (^|[[:space:]\;\&\|])e''val([[:space:]]|$) ]]; then
  deny "e""val is blocked. Run the actual command directly."
fi
if [[ "$cmd" =~ (^|[[:space:]\;\&\|])(bash|sh|zsh|dash)[[:space:]]+-c([[:space:]]|$) ]]; then
  deny "Shell-with-c indirection is blocked. Run the actual command directly."
fi
# Command substitution
if [[ "$cmd" =~ \$\( ]]; then
  deny "Command substitution \$(...) is blocked in tool input. Plan the command and run it directly."
fi
if [[ "$cmd" == *\`* ]]; then
  deny "Backtick command substitution is blocked. Use direct invocation."
fi

# Catastrophic filesystem: rm with recursive+force in any flag combination
if [[ "$cmd" =~ (^|[[:space:]\;\&\|])rm[[:space:]]+(-[a-zA-Z]*[rR][a-zA-Z]*[fF][a-zA-Z]*|-[a-zA-Z]*[fF][a-zA-Z]*[rR][a-zA-Z]*|--recursive|--force) ]]; then
  deny "rm with recursive+force is blocked. Use a non-recursive form or remove specific files."
fi
# Also catch separated flags: rm -r ... -f / rm -f ... -r
if [[ "$cmd" =~ (^|[[:space:]\;\&\|])rm[[:space:]] ]] && \
   [[ "$cmd" =~ (^|[[:space:]])-[rR]([[:space:]]|$) ]] && \
   [[ "$cmd" =~ (^|[[:space:]])-[fF]([[:space:]]|$) ]]; then
  deny "rm with recursive+force is blocked. Use a non-recursive form or remove specific files."
fi

# Force pushes (all variants)
if [[ "$cmd" =~ git[[:space:]]+push[[:space:]]+.*--force-with-lease ]]; then
  deny "git push --force-with-lease is blocked. Open a PR or request explicit approval."
fi
if [[ "$cmd" =~ git[[:space:]]+push[[:space:]]+.*--force-if-includes ]]; then
  deny "git push --force-if-includes is blocked. Open a PR or request explicit approval."
fi
if [[ "$cmd" =~ git[[:space:]]+push[[:space:]]+.*--force ]] || [[ "$cmd" =~ git[[:space:]]+push[[:space:]]+.*-f([[:space:]]|$) ]]; then
  deny "git push --force is blocked. Open a PR or request explicit approval."
fi
if [[ "$cmd" =~ git[[:space:]]+-c[[:space:]]+push\.force=true[[:space:]]+push ]]; then
  deny "git -c push.force=true push is blocked. Open a PR or request explicit approval."
fi
if [[ "$cmd" =~ git[[:space:]]+push[[:space:]]+[^[:space:]]+[[:space:]]+\+ ]]; then
  deny "git push with refspec-prefix force (+branch) is blocked. Open a PR or request explicit approval."
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
  'TRUNCATE[[:space:]]+TABLE' \
  'cdk[[:space:]]+deploy' \
  'pulumi[[:space:]]+up' \
  'serverless[[:space:]]+deploy' \
  'wrangler[[:space:]]+deploy' \
  'helm[[:space:]]+upgrade' \
  'helm[[:space:]]+install' \
  'gcloud[[:space:]]+run[[:space:]]+deploy' \
  'gcloud[[:space:]]+app[[:space:]]+deploy' \
  'aws[[:space:]]+s3[[:space:]]+(cp|sync|mv).*(prod|production)' \
  'flyctl[[:space:]]+deploy' \
  'cap[[:space:]]+production[[:space:]]+deploy'
do
  if [[ "$cmd" =~ $pat ]]; then
    deny "Release/destructive action ($pat) requires explicit human approval. Use /superbuilder:supership."
  fi
done

# Secret exfiltration: .env reads via many tools (allow intermediate flags/args)
if [[ "$cmd" =~ (^|[[:space:]\;\&\|])(cat|less|more|head|tail|bat|xxd|od|strings|base64)([[:space:]]+[^[:space:]]+)*[[:space:]]+([^[:space:]]+/)*\.env(\b|$) ]]; then
  deny "Reading .env files is blocked."
fi
if [[ "$cmd" =~ (grep|awk|sed)[[:space:]]+.+[[:space:]]+\.env(\b|$) ]]; then
  deny "Reading .env files via grep/awk/sed is blocked."
fi
if [[ "$cmd" =~ (python|python3)[[:space:]]+-c.*\.env ]]; then
  deny "Python -c reading .env files is blocked."
fi
if [[ "$cmd" =~ node[[:space:]]+-e.*\.env ]]; then
  deny "Node -e reading .env files is blocked."
fi
if [[ "$cmd" =~ (curl|wget).*--upload-file.*\.env ]]; then
  deny "Uploading .env via curl/wget is blocked."
fi
if [[ "$cmd" =~ nc[[:space:]]+.*\<.*\.env ]]; then
  deny "Sending .env via nc is blocked."
fi
if [[ "$cmd" =~ git[[:space:]]+add[[:space:]]+.*\.env ]]; then
  deny "Committing .env files is blocked."
fi

exit 0
