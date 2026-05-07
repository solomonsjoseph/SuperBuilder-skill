---
name: 04-triage-existing-work
description: Use when the project has an existing backlog (issues, todos, half-finished branches) before starting autonomous work. Classifies each item as keep/replace/defer/drop and folds keepers into the PRD's user stories. Prevents Superbuilder from duplicating or contradicting in-flight work.
---

# Triage Existing Work

## Purpose

Stop autonomous Superbuilder runs from colliding with the user's existing in-flight work. Classify the backlog, fold the relevant items into the PRD, defer or drop the rest.

## When to invoke

- After `01-context-sync` and before `02-write-prd` IF the project has any of: open GitHub/GitLab issues, an `ISSUES.md` or `TODO.md`, in-flight branches with uncommitted work, draft PRs.
- When the user explicitly asks: "what about the open issues?"

## Required outputs

1. **`.superbuilder/triage.md`** — table of every backlog item with columns:
   - source (issue #, file path, branch name)
   - title
   - classification: `keep` | `replace` | `defer` | `drop`
   - reason
   - mapped US id (if `keep` or `replace`)

2. Update `.superbuilder/PRD.md` Out-of-Scope or In-Scope to reflect the triage.

## Classification rules

- **keep** — item is relevant to the new PRD AND independent enough to fold in as a user story. Map to a US id.
- **replace** — item is partly relevant; the new PRD covers it more completely. Mark the original as superseded; reference the superseding US id.
- **defer** — relevant but later. Move to `.superbuilder/deferred.md`.
- **drop** — irrelevant or contradicted by the new direction. Drop ONLY with explicit user confirmation per item via `AskUserQuestion`.

## In-flight branches

For any branch with uncommitted work or unmerged commits:
- Run `git log --oneline <branch> ^main` to see what's there.
- Do NOT touch the branch.
- Tell the user the branch exists and ask whether to: rebase onto `superbuilder/integration`, leave alone, or hand its commits to a specific US.

## Source basis

Matt Pocock `triage` (state machine for incoming work) + Addy `planning-and-task-breakdown` (story shape).

## Anti-rationalization rules

- "Nothing in the issue tracker matters anymore" — confirm per-item with the user. Silent drops cause regressions.
- "I'll fix the open PRs while I'm in there" — no. Open PRs are the user's territory until they say otherwise.
- "The branch looks abandoned" — never delete branches. The user owns branch hygiene.

## Hand-off

After triage, return to `02-write-prd` (or update the existing PRD if it's already drafted), then `03-plan-stories`.
