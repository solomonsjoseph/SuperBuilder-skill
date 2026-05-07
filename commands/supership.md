---
description: Prepare release readiness — release notes, rollback plan, staged-rollout suggestion. NEVER deploys without explicit user approval; the approval flag must be passed in $ARGUMENTS.
argument-hint: [optional: "approve-deploy" to authorize an actual deploy step]
allowed-tools: Read, Write, Bash, Task
---

Release-readiness flow. Argument: $ARGUMENTS

## Phase 1 — Always run, never destructive

1. Invoke the `09-ship-readiness` skill.
2. Verify all stories in `.superbuilder/prd.json` have `passes: true` AND populated `evidence/` folders. Any false-pass aborts the flow with a loud failure.
3. Run quality gates one more time on the integration branch: typecheck, tests, lint, secret scan, dependency audit, license check, browser/a11y/performance for relevant stories. Capture results in `.superbuilder/reports/release-<timestamp>/`.
4. Dispatch `release-manager` agent to produce:
   - `release-notes.md` — what shipped, by user story.
   - `rollback.md` — exact revert procedure, who to ping, what monitoring to watch.
   - `staged-rollout.md` — canary/percent rollout suggestion appropriate to project type.
5. Open a PR (if a remote exists) from `superbuilder/integration` to the project's target branch. PR body links the report.

## Phase 2 — Only if $ARGUMENTS contains exactly "approve-deploy"

Even with the flag, you must:
- Confirm `.superbuilder/prd.json` has `deploymentAllowed: true` (the user must have flipped this manually).
- Confirm a file `.superbuilder/approvals/deploy-<datestamp>.txt` exists, signed by the user.
- If both conditions hold, EXECUTE the deploy command listed in `.superbuilder/prd.json`'s `deployCommand` field. The hooks will still gate the actual command — they may deny it; don't try to bypass.

If either condition is missing, refuse with: "Deploy not authorized. Phase 1 complete; PR is ready for human review."

## Output

Status block:
- Stories shipped:
- Gates passed:
- PR URL (if opened):
- Deploy state: NOT-DEPLOYED (default) | DEPLOYED-<env>
- Rollback owner / instructions: (link to rollback.md)
