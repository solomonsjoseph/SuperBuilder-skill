#!/usr/bin/env bash
# verify-stop.sh — Stop hook last line of defense for Superbuilder.
# Reads Stop hook JSON on stdin, verifies that every PRD story marked
# passes:true has the required evidence artifacts on disk. Emits a single
# JSON decision object on stdout. Never fails open: any error blocks.

set -uo pipefail

emit_block() {
    local reason="$1"
    # shellcheck disable=SC2016
    printf '{"decision":"block","reason":%s,"systemMessage":"Superbuilder Stop gate blocked: evidence missing"}\n' \
        "$(printf '%s' "$reason" | jq -Rs . 2>/dev/null || printf '"verify-stop hook errored: jq missing"')"
    exit 0
}

emit_error_block() {
    local reason="$1"
    printf '{"decision":"block","reason":%s}\n' \
        "$(printf 'verify-stop hook errored: %s' "$reason" | jq -Rs . 2>/dev/null || printf '"verify-stop hook errored: jq missing"')"
    exit 0
}

emit_approve() {
    printf '{"decision":"approve"}\n'
    exit 0
}

# Drain stdin so the caller's pipe never blocks. We don't need its content;
# the PRD on disk is the source of truth.
cat >/dev/null 2>&1 || true

if ! command -v jq >/dev/null 2>&1; then
    printf '{"decision":"block","reason":"verify-stop hook errored: jq not installed"}\n'
    exit 0
fi

project_dir="${CLAUDE_PROJECT_DIR:-$PWD}"
prd_path="${project_dir}/.superbuilder/prd.json"
evidence_root="${project_dir}/.superbuilder/evidence"

if [[ ! -f "$prd_path" ]]; then
    # No PRD = not a Superbuilder session, nothing to verify.
    exit 0
fi

# Validate JSON parseability up front.
if ! jq -e . "$prd_path" >/dev/null 2>&1; then
    emit_error_block "malformed PRD JSON at ${prd_path}"
fi

# Pull every passes:true story as a compact JSON line. Tolerate missing
# stories array, missing fields, nulls.
stories_jsonl="$(jq -c '
    (.stories // [])
    | map(select((.passes // false) == true))
    | .[]
' "$prd_path" 2>/dev/null)"
jq_rc=$?
if [[ "$jq_rc" -ne 0 ]]; then
    emit_error_block "failed to read stories from PRD"
fi

if [[ -z "$stories_jsonl" ]]; then
    # No passing stories to verify.
    emit_approve
fi

while IFS= read -r story; do
    [[ -z "$story" ]] && continue

    us_id="$(printf '%s' "$story" | jq -r '.id // "<unknown>"')"
    risk="$(printf '%s' "$story" | jq -r '.risk // "low"' | tr '[:upper:]' '[:lower:]')"

    commits_len="$(printf '%s' "$story" | jq -r '(.evidence.commits // []) | length')"
    if [[ "$commits_len" -le 0 ]] 2>/dev/null; then
        emit_block "${us_id}: evidence.commits is empty"
    fi

    diffs_len="$(printf '%s' "$story" | jq -r '(.evidence.diffs // []) | length')"
    if [[ "$diffs_len" -le 0 ]] 2>/dev/null; then
        emit_block "${us_id}: evidence.diffs is empty"
    fi

    # Validate every diff path exists and is non-empty.
    diff_paths="$(printf '%s' "$story" | jq -r '(.evidence.diffs // []) | .[]' 2>/dev/null)"
    while IFS= read -r dpath; do
        [[ -z "$dpath" ]] && continue
        # Resolve relative paths against the project dir.
        if [[ "$dpath" != /* ]]; then
            dpath="${project_dir}/${dpath}"
        fi
        if [[ ! -e "$dpath" ]]; then
            emit_block "${us_id}: diff artifact missing on disk: ${dpath}"
        fi
        if [[ ! -s "$dpath" ]]; then
            emit_block "${us_id}: diff artifact is empty: ${dpath}"
        fi
    done <<< "$diff_paths"

    # Risk-based artifact requirements.
    story_evidence_dir="${evidence_root}/${us_id}"

    if [[ "$risk" == "medium" || "$risk" == "high" ]]; then
        tests_log="${story_evidence_dir}/tests.log"
        tests_skipped="${story_evidence_dir}/tests.skipped.md"
        has_tests_log=0
        has_tests_skipped=0
        [[ -s "$tests_log" ]] && has_tests_log=1
        [[ -s "$tests_skipped" ]] && has_tests_skipped=1
        if [[ "$has_tests_log" -eq 0 && "$has_tests_skipped" -eq 0 ]]; then
            emit_block "${us_id}: risk=${risk} requires tests.log or tests.skipped.md in ${story_evidence_dir}"
        fi
        if [[ "$has_tests_log" -eq 1 && "$has_tests_skipped" -eq 1 ]]; then
            emit_block "${us_id}: risk=${risk} must have exactly one of tests.log or tests.skipped.md, found both"
        fi
    fi

    if [[ "$risk" == "high" ]]; then
        sec_log="${story_evidence_dir}/security.log"
        sec_skipped="${story_evidence_dir}/security.skipped.md"
        review_md="${story_evidence_dir}/review.md"

        has_sec_log=0
        has_sec_skipped=0
        [[ -s "$sec_log" ]] && has_sec_log=1
        [[ -s "$sec_skipped" ]] && has_sec_skipped=1
        if [[ "$has_sec_log" -eq 0 && "$has_sec_skipped" -eq 0 ]]; then
            emit_block "${us_id}: risk=high requires security.log or security.skipped.md in ${story_evidence_dir}"
        fi

        if [[ ! -s "$review_md" ]]; then
            emit_block "${us_id}: risk=high requires review.md in ${story_evidence_dir}"
        fi
    fi
done <<< "$stories_jsonl"

emit_approve
