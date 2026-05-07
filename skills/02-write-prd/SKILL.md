---
name: 02-write-prd
description: Use after context-sync to produce a PRD that is implementation-grade — every section answers "what gets built, what doesn't, how do we know it's done." Reads .superbuilder/intake.md and .superbuilder/context/*. Hands a finished PRD to plan-stories. Refuses to skip sections.
---

# Write PRD

## Purpose

Convert the refined idea + project context into a precise PRD. Implementation-grade means: an engineer who has never seen the conversation can pick up the PRD and start working without asking questions.

## When to invoke

- Step 3 of `/superbuilder:superbuild`, after `00-intake-refine` and `01-context-sync`.
- Whenever scope changes mid-build and the existing PRD is now wrong.

## Required output

Write `.superbuilder/PRD.md` with these sections — all required, no skipping:

1. **Summary** (2–3 sentences). What we're shipping.
2. **Primary user(s) & jobs to be done.** From `intake.md`, restated in the project's domain language from `context/domain.md`.
3. **Success criteria.** Three observable, falsifiable conditions. Tied to a specific user action when possible ("user can complete checkout in <3 clicks").
4. **In scope.** Bullet list of capabilities.
5. **Out of scope.** Bullet list of capabilities the user might assume but we will not build.
6. **Constraints.** Stack, runtime, deployment, latency budget, accessibility level (WCAG AA default for UI), browser/OS support matrix.
7. **Risks.** Top 5 risks with one-line mitigations. Mark security risks separately.
8. **Approval policy.** Which actions require human approval. Default list:
   - production deploy
   - destructive commands
   - secrets changes
   - billing/payment changes
   - auth changes
   - database destructive migrations
   - new production dependency
   - quality-gate weakening
   - public API contract change
9. **Quality gates (concrete commands).** From `context/gates.json`. Mark null gates explicitly.
10. **Deployment policy.** `deploymentAllowed: false` is the default. Document what changing it requires.
11. **Open questions.** Things the user must answer before story planning.

## Source basis

Merges Addy `spec-driven-development` (the section spine), Matt `to-prd` (conversation→PRD compression), Ralph PRD pattern (machine-readable contract). The output here is the human-facing markdown; `03-plan-stories` will materialize the JSON.

## Anti-rationalization rules

- "This is small, one section is enough." No. All eleven sections, even short.
- "The user already said this." Restate in the PRD anyway. The PRD is the canonical artifact agents read; conversation is ephemeral.
- "Risks are obvious." Write them anyway. If you cannot name 3 risks, you do not understand the project.
- "We can deploy from `main`." No. `deploymentAllowed` defaults to false. Production deploy is a separate, gated act.

## Hand-off

When PRD.md is complete AND the user has explicitly approved it (use `AskUserQuestion`), hand off to `03-plan-stories` to materialize the story JSON. Without explicit approval, the orchestrator must not start.
