---
name: 06-verify-slice
description: Use after build-slice to prove the story works with evidence. Runs the full relevant gate set (tests, integration, browser, accessibility, performance, security scan). Captures logs and screenshots into .superbuilder/evidence/<US-id>/. Refuses to mark the story passable without artifacts on disk.
---

# Verify Slice

## Purpose

Generate the evidence the orchestrator and the Stop hook will read to confirm the story actually works. No evidence = no pass.

## When to invoke

- After `05-build-slice` reports acceptance-criteria-met.
- Re-run after `07-review-slice` requests targeted re-test.

## Required gates (run the relevant subset)

| Gate | When relevant | Evidence file |
|---|---|---|
| Typecheck | Always when project has a type system | `evidence/<US>/typecheck.log` |
| Unit tests | Always | `evidence/<US>/tests.log` |
| Integration tests | When the story spans modules | `evidence/<US>/integration.log` |
| Lint / format | Always | `evidence/<US>/lint.log` |
| Browser verification | UI changes | `evidence/<US>/browser.md` (screenshots + console clean) |
| Accessibility | UI changes | `evidence/<US>/a11y.md` (axe / pa11y report) |
| Performance | Perf-sensitive change | `evidence/<US>/perf.md` (LCP / TTI / bundle delta) |
| Security scan | Always | `evidence/<US>/security.log` (dep audit + secret scan) |
| API contract | Public API change | `evidence/<US>/contract.md` (schema diff) |
| Migration dry run | Schema change | `evidence/<US>/migration.md` |

Use `agent-skills:browser-testing-with-devtools` (Chrome DevTools MCP) for browser verification. Use `mcp__plugin_playwright_*` if the project already uses Playwright. Take screenshots; do not just claim "looks fine."

## Default rule

> If a gate is relevant and not run, the story cannot pass.

If a gate command from `.superbuilder/context/gates.json` is null, write `evidence/<US>/<gate>.skipped.md` explaining why and what would be needed to enable it. The reviewer will decide whether the skip is acceptable.

## Source basis

Addy `browser-testing-with-devtools`, `debugging-and-error-recovery`, `performance-optimization`, plus the security/testing references from `agent-skills:test-driven-development` and `agent-skills:security-and-hardening`.

## Anti-rationalization rules

- "Tests pass on my machine" — capture the log. The Stop hook reads files, not your assurance.
- "Browser looks fine" — screenshot. No screenshot means no verification.
- "Skip flaky test, it's a known issue" — record the flake in `evidence/<US>/flakes.md`, do NOT delete or skip the test.
- "Integration test takes too long" — run it. Cap iterations elsewhere, not on verification.

## Hand-off

After all relevant gates are green and evidence is on disk, hand off to `07-review-slice`. The story is still NOT marked `passes: true` — review approval is required.
