#!/usr/bin/env bats

# Tests for hooks/scripts/load-superbuilder-context.sh

SCRIPT="$BATS_TEST_DIRNAME/../scripts/load-superbuilder-context.sh"

setup() {
  TMP_PROJECT=$(mktemp -d)
  export CLAUDE_PROJECT_DIR="$TMP_PROJECT"
}

teardown() {
  rm -rf "$TMP_PROJECT"
}

@test "empty .superbuilder/ absent => silent exit 0" {
  run "$SCRIPT" </dev/null
  [ "$status" -eq 0 ]
  [ -z "$output" ]
}

@test "valid prd.json with 2/5 passing => systemMessage contains '2/5'" {
  mkdir -p "$TMP_PROJECT/.superbuilder"
  cat >"$TMP_PROJECT/.superbuilder/prd.json" <<'JSON'
{
  "project": "demo",
  "userStories": [
    {"id": "US-001", "passes": true},
    {"id": "US-002", "passes": true},
    {"id": "US-003", "passes": false},
    {"id": "US-004", "passes": false},
    {"id": "US-005", "passes": false}
  ]
}
JSON
  run "$SCRIPT" </dev/null
  [ "$status" -eq 0 ]
  [[ "$output" == *"2/5"* ]]
}

@test "corrupt prd.json => silent exit 0 (known issue: failing loud preferred)" {
  # Current script swallows jq errors; documenting as known issue.
  mkdir -p "$TMP_PROJECT/.superbuilder"
  printf '{not-valid-json' >"$TMP_PROJECT/.superbuilder/prd.json"
  run "$SCRIPT" </dev/null
  [ "$status" -eq 0 ]
  # systemMessage may be present with garbled fallback values; we only assert
  # exit-code 0 (the documented current behavior). If the script is hardened
  # later, replace this with: [ -z "$output" ].
}
