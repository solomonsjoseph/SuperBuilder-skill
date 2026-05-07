---
name: 03-plan-stories
description: Use after PRD approval to materialize .superbuilder/prd.json with vertical-slice user stories. Each story has acceptance criteria, files-likely-touched, dependencies, risk level, and an empty evidence object. Refuses to produce stories that aren't independently testable.
---

# Plan Stories

## Purpose

Convert the PRD into a machine-readable, ordered list of vertical-slice user stories. The orchestrator picks stories from this file. The Stop hook reads it to verify completion claims.

## When to invoke

- Step 4 of `/superbuilder:superbuild`, after the PRD is approved.
- Mid-build, when scope changes (then create a delta plan, not a full rewrite).

## Required output

Write `.superbuilder/prd.json` matching the schema in `docs/ARCHITECTURE.md` (`schemaVersion: "superbuilder.prd.v2"`). Key constraints:

- `targetBranch` — the user's existing branch (NEVER `main` unless they explicitly chose it).
- `integrationBranch` — `superbuilder/integration` by default.
- `deploymentAllowed: false`.
- `humanApprovalRequiredFor` — at minimum the list from `02-write-prd`.
- `qualityGates` — copy from `.superbuilder/context/gates.json`. Null fields stay null.
- `sourceRefs` — copy from `.superbuilder/source-lock.json` (run `/superbuilder:supersources` first if missing).
- `userStories[]` — each story:
  - `id` — `US-001`, `US-002`, ... in execution order.
  - `title` — user-visible behavior, not file name.
  - `description` — 1–3 sentences in domain language.
  - `acceptanceCriteria` — 2–5 testable conditions starting with verbs.
  - `priority` — integer; lower number runs first.
  - `riskLevel` — `low | medium | high` based on what it touches.
  - `filesLikelyTouched` — best-effort path globs.
  - `dependencies` — array of US ids that must pass first.
  - `passes: false`, `attempts: 0`, `lastFailure: null`.
  - `evidence` — empty object with all keys present.

## Vertical-slice rule

Each story must deliver a thin end-to-end change a user could observe. NOT acceptable:
- "Set up the database schema." (no user-visible behavior)
- "Add config files." (infra without feature)
- "Refactor module X." (no acceptance criteria possible)

Acceptable:
- "User can register with email + password and receive a verification email."
- "Tasks completed within the last 24h appear under a 'recent' filter."

If a story is genuinely infrastructure-only (e.g. "set up CI"), allow it ONLY if the acceptance criteria are CI-job assertions: "GitHub Actions runs typecheck on PR open and blocks merge on failure."

## Source basis

Merges Addy `planning-and-task-breakdown`, Matt `to-issues`, Ralph `prd.json` shape. The triage step (`04-triage-existing-work`) handles existing backlog separately.

## Anti-rationalization rules

- "Just create one big story" — no. Stories must be independently testable.
- "Skip dependencies, the orchestrator will figure it out" — no, encode dependencies explicitly.
- "Acceptance criteria are obvious from the title" — write them anyway. The reviewer agent reads them, not the conversation.
- "Risk is always low for greenfield" — touching auth, billing, or destructive ops is high regardless of project age.

## Hand-off

When `.superbuilder/prd.json` is valid (run the orchestrator's `validate.ts` — see bin/superbuilder-gates), invoke `AskUserQuestion` for explicit planning approval. Then the `/superbuilder:superbuild` flow proceeds to sandboxed execution.
