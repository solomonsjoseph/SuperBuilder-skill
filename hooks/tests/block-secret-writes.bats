#!/usr/bin/env bats

# Tests for hooks/scripts/block-secret-writes.sh
#
# Pipes a PreToolUse Write payload through the script.

SCRIPT="$BATS_TEST_DIRNAME/../scripts/block-secret-writes.sh"

run_with() {
  local file_path="$1"
  local content="$2"
  local payload
  payload=$(jq -nc \
    --arg fp "$file_path" \
    --arg c "$content" \
    '{tool_name:"Write", tool_input:{file_path:$fp, content:$c}}')
  printf '%s' "$payload" | "$SCRIPT"
}

setup() {
  TMP_PROJECT=$(mktemp -d)
  export CLAUDE_PROJECT_DIR="$TMP_PROJECT"
}

teardown() {
  rm -rf "$TMP_PROJECT"
}

@test "denies: writing .env" {
  run run_with "$TMP_PROJECT/.env" "FOO=bar"
  [ "$status" -eq 0 ]
  [[ "$output" == *"deny"* ]]
}

@test "allows: writing .env.example" {
  run run_with "$TMP_PROJECT/.env.example" "FOO="
  [ "$status" -eq 0 ]
  [ -z "$output" ]
}

@test "denies: file content with BEGIN RSA PRIVATE KEY" {
  run run_with "$TMP_PROJECT/notes.md" "stuff
-----BEGIN RSA PRIVATE KEY-----
...
"
  [ "$status" -eq 0 ]
  [[ "$output" == *"deny"* ]]
}

@test "denies: AKIA AWS access key id" {
  run run_with "$TMP_PROJECT/note.txt" "AKIAABCDEFGHIJKLMNOP"
  [ "$status" -eq 0 ]
  [[ "$output" == *"deny"* ]]
}

@test "allows: package-lock.json with sha512 hashes (not a false positive)" {
  local content='{"lockfileVersion": 3, "packages": {"node_modules/foo": {"integrity": "sha512-aaaabbbbccccddddeeee/+abcdef==", "resolved": "https://x/y"}}}'
  run run_with "$TMP_PROJECT/package-lock.json" "$content"
  [ "$status" -eq 0 ]
  [ -z "$output" ]
}

@test "denies: writing hooks/hooks.json without approval marker (plugin-root scoped)" {
  export CLAUDE_PLUGIN_ROOT="$TMP_PROJECT"
  mkdir -p "$TMP_PROJECT/hooks"
  run run_with "$TMP_PROJECT/hooks/hooks.json" '{"hooks":{}}'
  [ "$status" -eq 0 ]
  [[ "$output" == *"deny"* ]]
}

@test "allows: writing hooks/hooks.json with approval marker present (plugin-root scoped)" {
  export CLAUDE_PLUGIN_ROOT="$TMP_PROJECT"
  mkdir -p "$TMP_PROJECT/hooks"
  mkdir -p "$TMP_PROJECT/.superbuilder/approvals"
  : > "$TMP_PROJECT/.superbuilder/approvals/policy-change-deadbeef.md"
  run run_with "$TMP_PROJECT/hooks/hooks.json" '{"hooks":{}}'
  [ "$status" -eq 0 ]
  [ -z "$output" ]
}

@test "denies: writing inside CLAUDE_PLUGIN_ROOT/hooks/scripts/ without approval marker" {
  PLUGIN_ROOT=$(mktemp -d)
  export CLAUDE_PLUGIN_ROOT="$PLUGIN_ROOT"
  mkdir -p "$PLUGIN_ROOT/hooks/scripts"
  run run_with "$PLUGIN_ROOT/hooks/scripts/foo.sh" '#!/bin/sh
echo hi'
  [ "$status" -eq 0 ]
  [[ "$output" == *"deny"* ]]
  rm -rf "$PLUGIN_ROOT"
}

@test "denies: writing CLAUDE_PLUGIN_ROOT/hooks/hooks.json without approval marker" {
  PLUGIN_ROOT=$(mktemp -d)
  export CLAUDE_PLUGIN_ROOT="$PLUGIN_ROOT"
  mkdir -p "$PLUGIN_ROOT/hooks"
  run run_with "$PLUGIN_ROOT/hooks/hooks.json" '{"hooks":{}}'
  [ "$status" -eq 0 ]
  [[ "$output" == *"deny"* ]]
  rm -rf "$PLUGIN_ROOT"
}

@test "allows: writing user-project hooks/scripts/ outside CLAUDE_PLUGIN_ROOT" {
  PLUGIN_ROOT=$(mktemp -d)
  USER_PROJECT=$(mktemp -d)
  export CLAUDE_PLUGIN_ROOT="$PLUGIN_ROOT"
  mkdir -p "$USER_PROJECT/hooks/scripts"
  run run_with "$USER_PROJECT/hooks/scripts/lint.sh" '#!/bin/sh
echo lint'
  [ "$status" -eq 0 ]
  [ -z "$output" ]
  rm -rf "$PLUGIN_ROOT" "$USER_PROJECT"
}

@test "allows: writing user-project .claude-plugin/ outside CLAUDE_PLUGIN_ROOT" {
  PLUGIN_ROOT=$(mktemp -d)
  USER_PROJECT=$(mktemp -d)
  export CLAUDE_PLUGIN_ROOT="$PLUGIN_ROOT"
  mkdir -p "$USER_PROJECT/.claude-plugin"
  run run_with "$USER_PROJECT/.claude-plugin/something.json" '{"x":1}'
  [ "$status" -eq 0 ]
  [ -z "$output" ]
  rm -rf "$PLUGIN_ROOT" "$USER_PROJECT"
}

@test "allows: CLAUDE_PLUGIN_ROOT unset, writing any /hooks/scripts/ falls through" {
  unset CLAUDE_PLUGIN_ROOT
  TARGET=$(mktemp -d)
  mkdir -p "$TARGET/hooks/scripts"
  run run_with "$TARGET/hooks/scripts/foo.sh" '#!/bin/sh
echo ok'
  [ "$status" -eq 0 ]
  [ -z "$output" ]
  rm -rf "$TARGET"
}
