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
  .env|.env.*|*.pem|*.key|id_rsa|id_ed25519|*.pfx|*.p12)
    deny "Writing $base is forbidden. Secrets and key material must not be committed." ;;
esac

# Block writes that look like raw secret material
if printf '%s' "$content" | grep -E -q 'BEGIN (RSA|OPENSSH|EC|DSA|PRIVATE) KEY'; then
  deny "File content contains a private key block. Refusing to write."
fi
if printf '%s' "$content" | grep -E -q '(AKIA[0-9A-Z]{16}|sk-[A-Za-z0-9]{20,}|ghp_[A-Za-z0-9]{20,}|xox[baprs]-[A-Za-z0-9-]{10,})'; then
  deny "File content contains a likely API token / secret. Refusing to write."
fi

# Block silent gate tampering
if [[ "$file_path" =~ (^|/)hooks/hooks\.json$ ]] || [[ "$file_path" =~ (^|/)\.claude-plugin/plugin\.json$ ]]; then
  if printf '%s' "$content" | grep -E -q '(disabled|skip-validate|noVerify)'; then
    deny "Refusing to weaken Superbuilder safety configuration."
  fi
fi

exit 0
