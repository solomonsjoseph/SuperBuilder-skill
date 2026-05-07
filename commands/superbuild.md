---
description: End-to-end autonomous build. Idea → grilled spec → PRD → stories → sandboxed execution → evidence → final PR-ready report.
argument-hint: [optional one-line idea]
allowed-tools: Read, Write, Edit, Bash, Glob, Grep, AskUserQuestion, TodoWrite, Task
---

You are running the Superbuilder end-to-end build flow.

The user's idea (may be empty if they want to provide it conversationally): $ARGUMENTS

## Mandatory order

1. **Invoke the `00-intake-refine` skill** to grill the idea. If the idea is vague, refuse to proceed until the success criteria, primary user, and out-of-scope items are explicit. Push back on anything overbuilt or under-scoped. Use `AskUserQuestion` for the smallest set of blocking questions.
2. **Invoke the `01-context-sync` skill** to map the target project (or confirm greenfield). Detect package manager via the order documented in the skill — never hardcode npm/pnpm/yarn/bun.
3. **Invoke the `02-write-prd` skill** to produce a PRD. The PRD must explicitly mark `riskLevel`, `deploymentAllowed: false`, and `humanApprovalRequiredFor`.
4. **Invoke the `03-plan-stories` skill** to materialize `.superbuilder/prd.json` per the schema in `docs/ARCHITECTURE.md`. Stories must be vertical slices with acceptance criteria.
5. **Stop and present the plan.** Use `AskUserQuestion` to ask: "Approve this PRD + story plan to begin sandboxed execution?" Do NOT continue without explicit approval.
6. **After approval**, hand off to the orchestrator:
   ```bash
   "$CLAUDE_PLUGIN_ROOT/bin/superbuilder-run" --root .superbuilder
   ```
   The orchestrator iterates stories through Sandcastle. While it runs, monitor `.superbuilder/progress.md` and report status concisely.
7. **For each completed story**, confirm evidence exists at `.superbuilder/evidence/<US-id>/`. Stories without evidence are NOT passes — invoke `06-verify-slice` and `07-review-slice` to diagnose.
8. **When all stories pass or the iteration cap is hit**, invoke `09-ship-readiness` to assemble the final PR-ready report.
9. **STOP before deploy.** Tell the user explicitly that production deploy requires running `/superbuilder:supership` and providing approval.

## Hard rules

- Never run `git push --force`, `npm publish`, deploy commands, or destructive DB ops. The hooks will block these — do not try to bypass them.
- Never mark a story `passes: true` without files in its `evidence/` folder. The Stop hook will reject the session.
- Never write directly to `main` or the project's target branch. All work goes through `superbuilder/integration` and per-story branches `superbuilder/<US-id>-<slug>`.
- Never silently install dependencies. Adding a dependency triggers approval per the `humanApprovalRequiredFor` policy in the PRD.

## Output

End with a concise status: stories passed/failed, blockers, evidence locations, next recommended command (typically `/superbuilder:superreview` or `/superbuilder:supership`).
