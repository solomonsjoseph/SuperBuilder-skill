---
name: 01-context-sync
description: Use after intake-refine to build a project/domain map before any planning or coding. Detects package manager, reads existing docs and ADRs, captures domain language, and produces a context packet other agents will reuse. Required before write-prd or plan-stories.
---

# Context Sync

## Purpose

Stop agents from guessing the project's stack, conventions, or domain language. Produce one canonical context packet that planner, implementer, reviewer, and security-auditor all read.

## When to invoke

- Step 2 of `/superbuilder:superbuild`.
- Whenever the project changes branches, frameworks, or significant subsystems.
- Before any agent that touches unfamiliar code.

## Required outputs (all under `.superbuilder/context/`)

1. **`stack.json`** — language(s), framework(s), package manager (detected via lockfile order below), test runner, lint/format tools, type checker, build command, dev server command.
2. **`domain.md`** — domain terms in the user's words. Pull from existing `CONTEXT.md`, `README.md`, ADRs, code comments. Mark conflicts where the same term means two things.
3. **`tree.md`** — top-level directory map with one-line purpose per major folder.
4. **`adrs.md`** — list of existing ADRs (path + title + date). Do NOT summarize them; just index them.
5. **`gates.json`** — concrete commands for typecheck/lint/test/secret-scan/dep-audit derived from the project. Pre-populate by calling `defaultGates(stack)` from `orchestrator/src/gate-defaults.ts` with the detected `StackInfo`, then **show the result to the user and ask them to confirm or override every gate** before writing `.superbuilder/context/gates.json`. If a gate has no command, mark it null — the orchestrator will skip and warn.
6. **`risks.md`** — pre-existing technical debt, brittle code paths, modules with no tests, hardcoded production assumptions.

## Package manager detection (use this exact order, never hardcode)

```
pnpm-lock.yaml      → pnpm
yarn.lock           → yarn
package-lock.json   → npm
bun.lockb / bun.lock→ bun
poetry.lock         → poetry
uv.lock             → uv
Cargo.lock          → cargo
go.mod              → go
Gemfile.lock        → bundler
composer.lock       → composer
```

If multiple lockfiles exist, prefer the one mentioned in `package.json#packageManager`, then the most recently modified.

## Source basis

Merges Addy `context-engineering`, Addy `source-driven-development`, Matt `setup-matt-pocock-skills`, Matt `grill-with-docs`, Matt `zoom-out`. Do not duplicate their text — extract the moves:

- Index, don't summarize, until the user asks.
- Conflicts in the domain glossary become explicit decisions, not silent overrides.
- Always read existing ADRs before proposing architecture.
- Capture what's missing as risks, not "we'll fix it."

## Anti-rationalization rules

- "It's just a prototype, no docs needed" — still produce stack.json and gates.json. The orchestrator depends on them.
- "I can read the code as I go" — no. Read once, hand a packet to other agents. Avoids re-reading per story.
- "The user said it's TypeScript, that's enough" — detect lockfile, framework, test runner. Don't guess pnpm vs npm.

## Hand-off

When `.superbuilder/context/` is populated and user confirms, hand off to `02-write-prd`. The PRD writer reads the packet — don't restate the same facts there.
