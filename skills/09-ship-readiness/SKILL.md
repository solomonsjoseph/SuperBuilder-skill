---
name: superbuilder-ship-readiness
description: Use after all stories pass to assemble a release package — release notes, rollback plan, staged rollout, final gate sweep — without deploying. Powers /superbuilder:supership. Refuses to mark anything as deployed unless the user has explicitly approved.
---

# Ship Readiness

## Purpose

Produce everything needed for a human to look at a finished branch and decide whether to deploy. Stop at "PR ready." The deploy step is gated separately.

## When to invoke

- Final step of `/superbuilder:superbuild` after all stories show `passes: true` with evidence.
- When `/superbuilder:supership` is called.

## Required outputs

All under `.superbuilder/reports/release-<timestamp>/`:

1. **`release-notes.md`** — grouped by user story, written for the project's audience. No marketing fluff; what changed and why.
2. **`rollback.md`** — exact revert procedure, owner, monitoring to watch, time bound for rollback decision.
3. **`staged-rollout.md`** — appropriate for the project type:
   - Web app: feature flag + percent rollout, success metric, error-rate alarm.
   - Library: pre-release tag → main release; consumers list.
   - CLI: pre-release npm tag, dogfood window.
4. **`gate-sweep.md`** — final run of all relevant gates on the integration branch:
   - typecheck, lint, format
   - full test suite
   - secret scan
   - dependency audit
   - license check (every dep added during the run)
   - browser/a11y/perf for UI stories
   - migration dry run
5. **`pr-body.md`** — populated PR description with: summary, story-by-story changes, test evidence links, security notes, deploy-not-yet warning. NEVER include AI/Claude attribution.
6. **`risks.md`** — what's known-imperfect, what wasn't tested, what could regress.

## Hand-off / no-deploy

- Open a PR from `superbuilder/integration` to the project's target branch (using `gh pr create` if a remote exists). Use the populated `pr-body.md` as the PR body.
- DO NOT tag, publish, or deploy. The hooks block these; do not try to bypass.
- Tell the user: "Release prepared. To deploy, run `/superbuilder:supership approve-deploy` AND ensure `.superbuilder/prd.json#deploymentAllowed` is `true` AND a signed approval file exists in `.superbuilder/approvals/`."

## Source basis

Addy `git-workflow-and-versioning`, `ci-cd-and-automation`, `deprecation-and-migration`, `shipping-and-launch`. Followed strictly: prepare, never execute.

## Anti-rationalization rules

- "Just push the tag, it's harmless" — no. Tags trigger CI which can deploy. Stop at PR.
- "Skip rollback.md, it's a small change" — write it. Rollbacks are needed precisely when you didn't expect them.
- "The user said 'deploy it'" — verify the approval file path AND the deploymentAllowed flag. Verbal approval in chat is not sufficient.
