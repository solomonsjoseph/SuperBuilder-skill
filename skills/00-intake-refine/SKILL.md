---
name: 00-intake-refine
description: Use when a user dumps a rough software idea, asks Superbuilder to "build X", or invokes /superbuilder:superbuild. Grills the idea until success criteria, primary user, scope edges, and risks are explicit. Pushes back on vague, overbuilt, or unsafe proposals before any planning happens.
---

# Intake & Refine

## Purpose

Convert a vague idea into a precise, challengeable proposal that can become a PRD. The agent must NOT proceed past this skill if the result is still hand-wavy.

## When to invoke

- First step of `/superbuilder:superbuild`.
- Any time the user says "build me X" without acceptance criteria.
- After a failed run where retrospect shows the original spec was unclear.

## Required outputs (write to `.superbuilder/intake.md`)

1. **One-line product statement** — "for <user>, this <does X> so that <outcome>."
2. **Three success criteria** — observable, falsifiable. Not "users will love it."
3. **Out of scope** — bullet list of things the user might assume but we will not build.
4. **Primary user(s)** — concrete persona, not "everyone."
5. **Top 3 risks** — security, legal, product, technical. Each with a 1-line mitigation.
6. **Constraints** — language(s), runtime, deployment target, budget for tokens/time.
7. **Existing project?** — yes/no. If yes, capture target branch, package manager (detected from lockfiles), CI provider.

## Grilling protocol

Use `AskUserQuestion` for blocking questions ONLY. Pick the smallest set that resolves ambiguity. Bad questions ("what color?") are forbidden. Good questions:

- "Will this app store user data? If yes: PII or just preferences?"
- "Should this run as a CLI, web app, or library?"
- "Is anyone else going to deploy this, or is it personal?"
- "Free or paid? If paid, are payments in scope?"

## Push-back rules — refuse to continue if any are true

- Idea is **overbuilt**: user asks for microservices/k8s/distributed for a single-user toy app. Counter-propose monolith.
- Idea is **legally risky**: scraping behind login walls, evading rate limits, processing health/financial data without compliance plan.
- Idea is **security-naive**: "build me an auth system" without clarifying who issues tokens, where keys live, what threat model applies.
- Idea is **physically impossible**: "real-time low-latency translation in 50 languages, run locally on a laptop, free."
- User refuses to specify out-of-scope: that means scope creep is guaranteed.

When refusing, propose 1–3 narrower variants the user could choose instead.

## Source basis

This skill merges Addy Osmani `idea-refine` (structured divergent/convergent thinking) with Matt Pocock `grill-me` (relentless interview discipline). Do not quote either source verbatim — use the patterns.

## Anti-rationalization rules

- "The user just wants something quick" — STILL grill. Quick + vague = scope explosion.
- "I can fill in defaults" — only after the three success criteria are pinned. Defaults for missing constraints are fine; defaults for missing success criteria are not.
- "It's just a prototype" — prototypes also have a primary user and a scope edge.

## Hand-off

When `.superbuilder/intake.md` is complete and the user has confirmed it, hand off to `01-context-sync`. Do NOT skip ahead to PRD.
