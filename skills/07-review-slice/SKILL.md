---
name: 07-review-slice
description: Use after verify-slice to fan out a parallel review (correctness, security, simplicity, test depth). On any blocker, dispatch the diagnose loop to root-cause and propose a fix. Only when all reviewers approve does the story become eligible for passes=true.
---

# Review Slice

## Purpose

Catch what tests miss: bad design, hidden security holes, overengineering, shallow tests, broken acceptance criteria. The previous skill (verify) confirmed it runs; this skill confirms it should be merged.

## When to invoke

- After `06-verify-slice` puts evidence on disk.
- Re-run after `05-build-slice` repairs a blocker.

## Required protocol

1. **Dispatch four subagents in parallel** (single message, multiple Agent calls):
   - `reviewer` — correctness, simplicity, maintainability, acceptance-criteria fit.
   - `security-auditor` — auth, secrets, input validation, dependency risk, permission scope, prod blast radius.
   - `test-engineer` — depth (not just smoke), red-green-refactor, no shallow assertions, regression coverage.
   - `architect` (only if the story touches architecture: new module, new boundary, ADR-worthy decision).

2. **Synthesize** verdicts into `.superbuilder/evidence/<US-id>/review.md`:
   - per-agent: verdict (`approve` / `request-changes` / `block`), top concerns
   - synthesis: overall `GO` / `NO-GO`
   - required fixes if NO-GO

3. **On `block` from any reviewer**, invoke the `diagnose` discipline (Matt `diagnose` + Addy `debugging-and-error-recovery`):
   - reproduce the issue
   - minimize the failing case
   - hypothesize root cause
   - instrument
   - fix in `05-build-slice`
   - regression-test in `06-verify-slice`

## Source basis

Merges Addy `code-review-and-quality`, `code-simplification`, `security-and-hardening` with Matt `diagnose`.

## Anti-rationalization rules

- "Reviewer's nit is style; ignore" — `request-changes` is NO-GO unless trivial AND user-waived. Don't auto-waive.
- "Security flagged a theoretical issue" — security verdict is binding. If you disagree, escalate to user, don't override.
- "Test coverage is fine, function is small" — test-engineer's verdict on depth, not just count, is binding.
- "It works, who cares about architecture" — architect's `block` for cross-cutting concern stops merge; document an ADR before retrying.

## Hand-off

When all dispatched reviewers return `approve`:
- Set the story's `passes: true` in `.superbuilder/prd.json`.
- Append commit SHAs and diff path to `evidence.<US-id>.commits` and `.diffs`.
- Hand off to the orchestrator for safe merge into `superbuilder/integration`.

When NO-GO, the orchestrator increments `attempts`, records `lastFailure`, and either retries (if cap not hit) or stops and reports.
