---
name: superbuilder-build-slice
description: Use during sandboxed story execution to implement one user story. Works inside a Sandcastle sandbox on a per-story branch. Writes minimal code to satisfy acceptance criteria, runs the project's tests, and never touches main. Refuses to deploy, publish, or modify shared infra.
---

# Build Slice

## Purpose

Implement exactly one user story inside an isolated sandbox. Touch the smallest set of files that delivers the story. Stop when acceptance criteria are met — do not refactor unrelated code.

## When to invoke

- The orchestrator dispatches this skill via the `implementer` agent inside a Sandcastle sandbox.
- Manual mid-story: when the user says "finish US-XXX in the current sandbox."

## Required behavior

1. **Read** the target story from `.superbuilder/prd.json` and the context packet from `.superbuilder/context/`.
2. **Confirm sandbox.** You must be inside a Sandcastle sandbox on branch `superbuilder/<US-id>-<slug>`. If not, refuse.
3. **Plan the smallest diff** that satisfies acceptance criteria. Identify files from `filesLikelyTouched`. Add to that list only when forced — record additions in the run log.
4. **Implement.**
   - For UI work: invoke `agent-skills:frontend-design` patterns; use the project's existing component library and design tokens; do not introduce a new UI framework.
   - For API work: follow `agent-skills:api-and-interface-design` for stable contracts; do not break existing public endpoints.
   - For tests: write tests FIRST per `agent-skills:test-driven-development` and Matt `tdd`. Red → green → refactor. No commenting-out failing tests.
5. **Run gates.**
   - typecheck, lint, format (using detected package manager).
   - Story-relevant tests only. Full suite runs in `06-verify-slice`.
6. **Commit small.** Conventional commits on the story branch. No co-author trailers, no AI footers.

## Hard constraints

- ❌ Never run `git push --force`, `npm publish`, deploy commands, or destructive DB ops. The hooks block these — don't try.
- ❌ Never write `.env`, private keys, or hardcoded secrets. The hooks block these.
- ❌ Never disable a test, comment out an assertion, or weaken a gate. If a test is wrong, replace it with a correct test that captures the intended behavior.
- ❌ Never add a dependency without recording it in `.superbuilder/runs/<US-id>.json` AND triggering approval (per PRD `humanApprovalRequiredFor`).
- ❌ Never touch files outside the story's scope unless the diff genuinely requires it; document each excursion.
- ❌ Never use `noSandbox()` — autonomous execution must always be sandboxed.

## Source basis

Merges Addy `incremental-implementation`, `test-driven-development`, `frontend-ui-engineering`, `api-and-interface-design`, plus Matt `tdd`. The skill is a coordination layer; the underlying disciplines are loaded as needed.

## Anti-rationalization rules

- "I see another bug while I'm here" — file it. Do not fix it in this story.
- "The test is clearly outdated" — replace it with a test that asserts the intended behavior. Don't delete.
- "Adding a quick utility lib" — record the dependency and trigger approval. No silent installs.
- "I'll just commit straight to integration" — no. Story branch always.

## Hand-off

When acceptance criteria look met locally, hand off to `06-verify-slice`. Do NOT mark the story `passes: true` in this skill — that happens only after verification + review pass.
