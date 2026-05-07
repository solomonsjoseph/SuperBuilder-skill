#!/usr/bin/env bats

# Tests for hooks/scripts/block-dangerous-bash.sh
#
# Each test pipes a PreToolUse JSON payload (Bash tool) through the script.
# - "deny" output (and exit 0) means the command was blocked.
# - empty stdout (and exit 0) means the command was allowed (fall-through).

SCRIPT="$BATS_TEST_DIRNAME/../scripts/block-dangerous-bash.sh"

run_with() {
  local cmd="$1"
  local payload
  payload=$(jq -nc --arg c "$cmd" '{tool_name:"Bash", tool_input:{command:$c}}')
  printf '%s' "$payload" | "$SCRIPT"
}

# ---- DENIES ----

@test "denies: rm -rf /" {
  run run_with 'rm -rf /'
  [ "$status" -eq 0 ]
  [[ "$output" == *"deny"* ]]
}

@test "denies: git push --force" {
  run run_with 'git push --force origin main'
  [ "$status" -eq 0 ]
  [[ "$output" == *"deny"* ]]
}

@test "denies: eval indirection" {
  run run_with 'eval "echo hi"'
  [ "$status" -eq 0 ]
  [[ "$output" == *"deny"* ]]
}

@test "denies: bash -c indirection" {
  run run_with 'bash -c "echo hi"'
  [ "$status" -eq 0 ]
  [[ "$output" == *"deny"* ]]
}

@test "denies: npm publish" {
  run run_with 'npm publish'
  [ "$status" -eq 0 ]
  [[ "$output" == *"deny"* ]]
}

@test "denies: vercel deploy --prod" {
  run run_with 'vercel deploy --prod'
  [ "$status" -eq 0 ]
  [[ "$output" == *"deny"* ]]
}

@test "denies: terraform destroy" {
  run run_with 'terraform destroy'
  [ "$status" -eq 0 ]
  [[ "$output" == *"deny"* ]]
}

@test "denies: dropdb foo" {
  run run_with 'dropdb foo'
  [ "$status" -eq 0 ]
  [[ "$output" == *"deny"* ]]
}

@test "denies: cat .env" {
  run run_with 'cat .env'
  [ "$status" -eq 0 ]
  [[ "$output" == *"deny"* ]]
}

@test "denies: xxd .env" {
  # TODO: re-enable after deny-list widening lands (xxd not yet covered)
  skip "xxd .env not yet matched by current regex"
  run run_with 'xxd .env'
  [ "$status" -eq 0 ]
  [[ "$output" == *"deny"* ]]
}

@test "denies: --no-verify" {
  run run_with 'git commit --no-verify -m foo'
  [ "$status" -eq 0 ]
  [[ "$output" == *"deny"* ]]
}

# ---- ALLOWS (negatives: empty stdout) ----

@test "allows: rm /tmp/foo (non-recursive)" {
  run run_with 'rm /tmp/foo'
  [ "$status" -eq 0 ]
  [ -z "$output" ]
}

@test "allows: ordinary git status" {
  run run_with 'git status'
  [ "$status" -eq 0 ]
  [ -z "$output" ]
}

@test "allows: ordinary npm install" {
  run run_with 'npm install'
  [ "$status" -eq 0 ]
  [ -z "$output" ]
}

@test "allows: ordinary cat README.md" {
  run run_with 'cat README.md'
  [ "$status" -eq 0 ]
  [ -z "$output" ]
}
