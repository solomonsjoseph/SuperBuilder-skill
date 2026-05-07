#!/usr/bin/env bash
# Block writes/edits that would commit secrets, .env files, private keys,
# or disable safety policy.

set -euo pipefail

input=$(cat)
tool_name=$(printf '%s' "$input" | jq -r '.tool_name // empty')
file_path=$(printf '%s' "$input" | jq -r '.tool_input.file_path // empty')
content=$(printf '%s' "$input" | jq -r '.tool_input.content // .tool_input.new_string // empty')

deny() {
  local reason="$1"
  jq -n --arg r "$reason" \
    '{hookSpecificOutput: {permissionDecision: "deny"}, systemMessage: $r}'
  exit 0
}

case "$tool_name" in
  Write|Edit) ;;
  *) exit 0 ;;
esac

base=$(basename "$file_path")
case "$base" in
  .env.example|.env.sample|.env.template|.env.dist)
    : ;;
  .env|.env.local|.env.production|.env.prod|.env.development|.env.dev|.env.staging|.env.test|*.pem|*.key|id_rsa|id_ed25519|*.pfx|*.p12)
    deny "Writing $base is forbidden. Secrets and key material must not be committed." ;;
esac

# Block writes that look like raw secret material
flat=$(printf '%s' "$content" | tr '\n\r\t' '   ' | tr -s ' ')
if printf '%s' "$flat" | grep -E -q 'BEGIN[[:space:]]+((RSA|OPENSSH|EC|DSA)[[:space:]]+)?PRIVATE[[:space:]]+KEY'; then
  deny "File content contains a private key block."
fi
# Stripe live secrets
if printf '%s' "$content" | grep -E -q 'sk_live_[A-Za-z0-9]{24,}'; then
  deny "File content contains a Stripe live secret key."
fi
# GitHub modern token formats
if printf '%s' "$content" | grep -E -q '(gho_|ghu_|ghs_|ghr_|github_pat_)[A-Za-z0-9_]{20,}'; then
  deny "File content contains a GitHub token."
fi
# Google API keys
if printf '%s' "$content" | grep -E -q 'AIza[0-9A-Za-z_-]{35}'; then
  deny "File content contains a Google API key."
fi
# AWS access key + secret key
if printf '%s' "$content" | grep -E -q 'AKIA[0-9A-Z]{16}'; then
  deny "File content contains an AWS access key id."
fi
if printf '%s' "$content" | grep -E -q 'aws_secret_access_key[[:space:]]*=[[:space:]]*[A-Za-z0-9/+=]{40}'; then
  deny "File content contains an AWS secret access key."
fi
# OpenAI / generic sk-
if printf '%s' "$content" | grep -E -q 'sk-[A-Za-z0-9]{20,}'; then
  deny "File content contains a likely OpenAI API token."
fi
# Slack
if printf '%s' "$content" | grep -E -q 'xox[baprs]-[A-Za-z0-9-]{10,}'; then
  deny "File content contains a Slack token."
fi
# Generic Bearer
if printf '%s' "$content" | grep -E -q 'Bearer[[:space:]]+[A-Za-z0-9._\-]{20,}'; then
  deny "File content contains a Bearer token."
fi

# Tamper-block hooks/.claude-plugin without approval
case "$file_path" in
  */hooks/hooks.json|*/hooks/scripts/*|*/.claude-plugin/plugin.json)
    approval_dir="${CLAUDE_PROJECT_DIR:-$PWD}/.superbuilder/approvals"
    if ! ls "$approval_dir"/policy-change-*.md >/dev/null 2>&1; then
      deny "Modifying $file_path requires an approval marker at .superbuilder/approvals/policy-change-<sha>.md."
    fi ;;
esac

exit 0
