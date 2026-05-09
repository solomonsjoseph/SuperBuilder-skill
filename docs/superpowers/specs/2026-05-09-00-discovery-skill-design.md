# Design: `00-discovery` Skill for Non-Technical Users

**Date:** 2026-05-09  
**Status:** Approved — ready for implementation

---

## Context

SuperBuilder's existing intake flow (`00-intake-refine` + `product-griller` agent) assumes the user already has a reasonably formed technical idea. Non-technical users — people who know they want to solve a problem but can't yet articulate it as a software spec — have no guided path in. They either bounce off the structured intake or produce a weak `intake.md` that causes downstream quality problems.

This change adds a `00-discovery` skill: an adaptive, one-question-at-a-time discovery conversation that meets non-technical users where they are, takes notes throughout, and at the end synthesizes everything into a plain-English action plan the user approves before the technical pipeline starts. The rest of SuperBuilder (01 → 09) is untouched.

---

## Architecture

Three files change. Everything else is untouched.

| File | Change |
|------|--------|
| `commands/superbuild.md` | Add detection question as step 0 (before any skill dispatch) |
| `skills/00-discovery/SKILL.md` | New skill (created) |
| `agents/product-griller.md` | Extend with discovery-mode persona and question guidance |

**Detection (step 0 in `/superbuild`):**
> "Do you have a clear picture of what you want to build technically, or would you like to figure it out together?"

- Answer "clear picture" → skip to `00-intake-refine` (existing path, unchanged)
- Answer "figure it out together" → invoke `00-discovery`

After `00-discovery` completes, the pipeline continues at `01-context-sync` as normal. `00-discovery` produces `intake.md` in the same format `00-intake-refine` produces — the downstream pipeline sees no difference.

---

## Discovery Grilling Protocol

**Core mechanics:**
- One question per message. No exceptions.
- Each question is derived from the previous answer — adaptive, not scripted.
- Tone: product manager + challenger. Warm, fact-based. Pushes back when vague or contradictory. Uses real-world scenarios to ground the conversation.
- The AI takes running notes silently throughout, building a draft understanding across all topic areas.

**Topics covered organically (no fixed order):**
1. What problem this solves and for whom
2. What "done" looks like in the user's own plain language (success criteria)
3. What it explicitly won't do (out-of-scope)
4. Who the actual users are (concrete persona, not "everyone")
5. How it reaches users: web app, mobile app, automation, API, other
6. What tools or services it connects to (integrations and ecosystem)
7. Time, budget, team constraints
8. At least one risk the user may not have considered (AI surfaces proactively)

**Push-back rules:**
- Vague answer → ask for a concrete example once before accepting
- Contradictory answer → surface it: "Earlier you said X, now you're saying Y — which is it?"
- Overbuilt scope → counter-propose smaller starting point
- Missing out-of-scope → require it before moving forward

**Completion signal:**
All 8 topic areas touched at least once AND no remaining "I don't know" on critical items (who the user is, what success looks like). Repeated short answers also signal completion.

**Synthesis step:**
Present full plain-English action plan. Ask: "Does this capture what you want to build? You can ask me to refine any part, or say 'proceed' to move to the next step."

---

## Output Format

### `.superbuilder/discovery.md` (user-facing, permanent record)

Plain language, user's own words where possible, under one page:

```markdown
# What We're Building
<2–3 sentences>

# Who It's For
<concrete persona>

# What Success Looks Like
1. <user action / observable outcome>
2. <user action / observable outcome>
3. <user action / observable outcome>

# What It Won't Do
- <explicit item>

# How It Works
**Format:** <web app / mobile / automation / other>
**Connects to:** <integrations or "none">

# Risks to Watch
- <plain-language risk>

# Open Questions
- <anything unresolved>
```

### `.superbuilder/intake.md` (pipeline-facing, invisible to user)

Auto-translated from `discovery.md` into the format expected by `01-context-sync`:

```markdown
# Intake

**One-liner:** For <persona>, <product> does <X> so that <outcome>.

**Success criteria (3, observable):**
1. <CLI-verifiable criterion>
2. <CLI-verifiable criterion>
3. <CLI-verifiable criterion>

**Out of scope:**
- <item>

**Primary user:** <concrete description>

**Top 3 risks:**
1. <risk> — mitigation: <mitigation>
2. <risk> — mitigation: <mitigation>
3. <risk> — mitigation: <mitigation>

**Constraints:** <stack, runtime, deployment if mentioned; "none specified" if not>
```

---

## Pipeline Integration

**Non-technical user path:**
```
/superbuild "I want to be more organized at work"
  ↓
Step 0: detection question
  ↓ "figure it out together"
00-discovery → grilling → synthesis → user approval
  ↓ writes discovery.md + intake.md
01-context-sync → 02-write-prd → 03-plan-stories → STOP → orchestrator → 09-ship-readiness
```

**Technical user path (unchanged):**
```
/superbuild "React app with Postgres and JWT auth"
  ↓
Step 0: detection question → "clear picture"
00-intake-refine → 01-context-sync → … (same as always)
```

---

## Verification

**Regression (automated):**
```bash
pnpm test && pnpm typecheck
bats hooks/
```

**Smoke tests (manual):**
1. Vague input + "figure it out together" → discovery conversation starts, one question at a time, synthesis doc presented, `discovery.md` + `intake.md` written on "proceed"
2. Technical input + "clear picture" → routes directly to `00-intake-refine`, discovery skipped
