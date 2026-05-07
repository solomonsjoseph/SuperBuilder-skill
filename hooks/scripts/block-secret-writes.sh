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

# Tamper-block hooks/.claude-plugin without approval.
#
# Scope: ONLY files inside the Superbuilder plugin's own install dir
# (${CLAUDE_PLUGIN_ROOT}). User projects with their own hooks/ dirs
# (Husky, Lefthook, custom git hooks) or .claude-plugin/ are unaffected.
#
# Graceful fallback: if CLAUDE_PLUGIN_ROOT is unset we cannot resolve the
# plugin install location deterministically, so we do not fire the
# tamper-block (false-deny on every write would be worse). The deny lists
# above for secrets/keys still apply.

# Probe `realpath -m` capability once. macOS / BSD realpath lacks `-m` and
# fails with "illegal option"; GNU realpath supports it. Cache the result
# so the helper below picks a portable path resolver per-invocation.
if command -v realpath >/dev/null 2>&1 && realpath -m -- / >/dev/null 2>&1; then
  HAS_REALPATH_M=1
else
  HAS_REALPATH_M=0
fi

# canonicalize_path <abs-or-relative-path>
# Prints the canonical (symlink-resolved) absolute path on stdout.
# Tries (in order): GNU `realpath -m`, BSD `realpath`, python3 os.path.realpath,
# native bash `cd $(dirname) && pwd -P` + basename. If every fallback fails
# (e.g. dirname does not exist), prints a warning to stderr and returns 1
# WITHOUT echoing the unresolved input — the caller treats that as a soft
# graceful-fallback (skip the tamper-block) rather than risk a prefix-match
# bypass on a symlinked install.
canonicalize_path() {
  local p="$1"
  local out=""
  if [ "$HAS_REALPATH_M" = "1" ]; then
    out=$(realpath -m -- "$p" 2>/dev/null) && [ -n "$out" ] && { printf '%s' "$out"; return 0; }
  fi
  # BSD realpath: only resolves if every path component exists. Try it.
  if command -v realpath >/dev/null 2>&1; then
    out=$(realpath -- "$p" 2>/dev/null) && [ -n "$out" ] && { printf '%s' "$out"; return 0; }
  fi
  # Python3 cross-platform fallback. os.path.realpath does NOT require the
  # leaf to exist, so this works even for files about to be created.
  # NB: python's `-c` mode does not treat `--` as an argv separator, so we
  # pass the path as the first positional. Any leading-dash edge case is
  # benign here because callers always pass absolute paths.
  if command -v python3 >/dev/null 2>&1; then
    out=$(python3 -c 'import os,sys;print(os.path.realpath(sys.argv[1]))' "$p" 2>/dev/null) \
      && [ -n "$out" ] && { printf '%s' "$out"; return 0; }
  fi
  # Last-resort native bash: dirname must exist for `cd` to succeed. Resolves
  # any symlinks in the dirname; the basename is appended verbatim (which is
  # what we want — the leaf may not exist yet).
  local dir
  dir=$(dirname -- "$p" 2>/dev/null) || dir=""
  if [ -n "$dir" ] && [ -d "$dir" ]; then
    local resolved_dir
    resolved_dir=$(cd -- "$dir" 2>/dev/null && pwd -P) || resolved_dir=""
    if [ -n "$resolved_dir" ]; then
      printf '%s/%s' "$resolved_dir" "$(basename -- "$p")"
      return 0
    fi
  fi
  printf 'block-secret-writes.sh: WARNING canonicalize_path failed for %s; tamper-block skipped\n' "$p" >&2
  return 1
}

if [ -n "${CLAUDE_PLUGIN_ROOT:-}" ]; then
  canon_file=""
  canon_root=""
  if canon_file=$(canonicalize_path "$file_path") && canon_root=$(canonicalize_path "$CLAUDE_PLUGIN_ROOT"); then
    # Strip any trailing slash on the root to make prefix comparisons clean.
    canon_root="${canon_root%/}"

    in_scope=0
    case "$canon_file" in
      "$canon_root"/hooks/hooks.json) in_scope=1 ;;
      "$canon_root"/hooks/scripts/*) in_scope=1 ;;
      "$canon_root"/.claude-plugin/plugin.json) in_scope=1 ;;
    esac

    if [ "$in_scope" -eq 1 ]; then
      approval_dir="${CLAUDE_PROJECT_DIR:-$PWD}/.superbuilder/approvals"
      if ! ls "$approval_dir"/policy-change-*.md >/dev/null 2>&1; then
        deny "Modifying $file_path requires an approval marker at .superbuilder/approvals/policy-change-<sha>.md."
      fi
    fi
  fi
  # If canonicalize_path failed for either side, we already logged a warning
  # to stderr; fall through (graceful) rather than fire a false-deny.
fi

exit 0
