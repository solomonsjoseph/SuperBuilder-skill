---
description: Final review fan-out — code-reviewer, security-auditor, test-engineer (and architect if architectural change). Synthesizes a single go/no-go decision.
argument-hint: [story id or branch; default current branch]
allowed-tools: Task, Read, Glob, Grep, Bash
---

Run a parallel review fan-out on $ARGUMENTS (or the current branch if blank).

## Steps

1. **Determine the diff.** If a story id like `US-003` is given, diff `.superbuilder/runs/US-003.json` notes against the integration branch. Otherwise diff the current branch against `superbuilder/integration` (or `main` if integration branch absent).

2. **Dispatch three subagents in parallel** (single message, three Agent tool calls):
   - `reviewer` — correctness, simplicity, maintainability, acceptance-criteria fit, diff quality.
   - `security-auditor` — auth, secrets, input validation, dependency risk, permission scope, unsafe shell, data exposure, production blast radius.
   - `test-engineer` — coverage of behavior change, test depth (not just smoke), red-green-refactor honored, no shallow assertions.

3. **If the diff touches architecture** (new module, new boundary, ADR-worthy decision), also dispatch `architect`.

4. **Synthesize.** Each agent returns a verdict. Combine into one report:

```
# Superreview — <target>

## Reviewer
verdict: approve | request-changes | block
top concerns:
- ...

## Security
verdict: approve | request-changes | block
top concerns:
- ...

## Test engineer
verdict: approve | request-changes | block
coverage gaps:
- ...

## (Architect — if applicable)
verdict: approve | request-changes | block
ADR needed: <ADR-NNNN ...>

## Synthesis
DECISION: GO | NO-GO
why: ...
required follow-ups before merge:
- ...
```

A single `block` from any agent forces NO-GO. `request-changes` is NO-GO unless the change is trivial and the user explicitly waives.

5. **Persist** the report to `.superbuilder/evidence/<story-id>/review.md` (or `.superbuilder/reports/review-<timestamp>.md` for branch reviews).
