---
name: superbuilder-architecture-guard
description: Use to detect ball-of-mud entropy and over-abstraction across stories — invoked after every Nth merge or whenever review-slice flags ADR-worthy decisions. Produces ADRs and concrete deepening proposals. Refuses to ship invented abstractions for hypothetical futures.
---

# Architecture Guard

## Purpose

Long autonomous runs accumulate small architectural decisions that drift the system toward a ball of mud or, just as bad, toward speculative over-engineering. This skill makes those decisions explicit (ADRs) and proposes deepening when modules become tightly coupled or duplicate logic.

## When to invoke

- After every 3rd story merged (orchestrator triggers automatically).
- When `07-review-slice` produces a verdict from the `architect` agent.
- When the user asks "is the architecture okay?" or "review the design."

## Required behavior

1. **Zoom out.** Read `.superbuilder/context/tree.md`, recent diffs, and the PRD. Look for:
   - modules that import from too many siblings
   - duplicated logic across stories
   - leaky boundaries (auth logic in business modules, business logic in presentation)
   - speculative abstractions added "for later"
   - missing ADRs for non-obvious choices

2. **Produce an ADR per non-obvious decision** at `.superbuilder/decisions/ADR-NNNN.md` with:
   - Status (proposed / accepted / superseded)
   - Context (one paragraph, in the project's domain language)
   - Decision (one short paragraph)
   - Consequences (positive and negative)
   - Alternatives considered (briefly)

3. **Deepening proposals** — when consolidation or extraction is justified:
   - propose a refactor as a new user story (not as silent edits in the current story)
   - estimate scope honestly (tests touched, behavior preserved)
   - flag risk

## Source basis

Matt `improve-codebase-architecture` + Matt `zoom-out` + Addy `documentation-and-adrs`. Follow the `claude-mem:pathfinder` philosophy when mapping cross-feature duplication.

## Anti-rationalization rules

- "Add an interface to be safe" — only when there are 2+ implementations now, not "we might have another later."
- "Refactor while we're here" — no, propose as a separate story. Mixing refactor + feature wrecks blame.
- "Skip the ADR; it's obvious" — write the ADR. Future agents (and humans) read ADRs, not your reasoning.
- "Three similar lines, extract a helper" — don't. Three is fine. Wait for divergence.

## Hand-off

ADRs go in `.superbuilder/decisions/`. Deepening proposals go back to `03-plan-stories` as new stories with `priority` placed appropriately. Do NOT execute the proposed refactor inside this skill.
