---
name: 00-discovery
description: Use when a user doesn't yet have a clear picture of what they want to build. Runs an adaptive one-question-at-a-time discovery conversation, takes notes throughout, and presents a plain-English action plan for user approval before handing off to the technical pipeline. Invoked by /superbuild when the user chooses "figure it out together" at the detection step.
---

# Discovery

## Purpose

Help users who don't have a technical picture yet arrive at one through conversation. Ask one question at a time. Listen. Take notes. Challenge vague or contradictory answers with facts and real scenarios. When the picture is complete, present it back in plain language and get the user's confirmation before any technical work begins.

This skill is NOT a streamlined version of `00-intake-refine`. It is a discovery conversation first. The user may not know what they want — that is the starting condition, not a problem.

## When to invoke

- `00-discovery` is called by `/superbuild` when the user selects "figure it out together" at the step 0 detection question.
- Never invoke this skill on behalf of a user who has already described a clear technical idea — route them to `00-intake-refine` instead.

## Tone

**Product manager + challenger.**

- Warm, patient, plain language. No jargon unless the user uses it first.
- Fact-based. When the user's expectation doesn't match reality, say so: "That's worth knowing — most apps that do X also need Y, or they break in common scenarios."
- Relentless but not harsh. Keep asking until the picture is clear. One follow-up is enough to push back on a vague answer; then accept and move on.
- Uses real-world scenarios to make abstract questions concrete: "Imagine it's Monday morning. What does a typical user do first?"

## Note-taking

Maintain a running internal draft throughout the entire conversation. You do NOT show this to the user while building it. After each answer, silently update your understanding across these areas:

| Area | What you're tracking |
|------|---------------------|
| Problem | What pain/need prompted this |
| Primary user | Who specifically uses it (not "everyone") |
| Success criteria | What observable outcomes say "done" |
| Out of scope | What the user explicitly rules out |
| Delivery format | Web / mobile / automation / API / other |
| Integrations | Tools, services, or data sources it connects to |
| Constraints | Time, budget, team size, existing systems |
| Risks | What could go wrong (surface at least one the user didn't name) |

## Grilling protocol

**Rule 1 — One question per message, always.**
Never ask two questions in the same message. If a topic needs more depth, ask follow-ups in subsequent turns.

**Rule 2 — Follow the thread.**
Derive the next question from the previous answer. Questions come from what the user said, not from a fixed checklist. The checklist exists to make sure nothing is missed — not to dictate order.

**Rule 3 — Ask for concrete examples when the answer is abstract.**
"What do you mean by 'organized'?" → "Can you give me a specific example of a moment when you felt disorganized and wish this tool existed?"

**Rule 4 — Surface contradictions directly, once.**
"Earlier you said you wanted this to be for your whole team. Now you're saying only you would use it. Which is it?"

**Rule 5 — Challenge overbuilt scope, once.**
"That's a lot for a first version. What's the single most important thing to get right before anything else?"

**Rule 6 — Require out-of-scope before moving on.**
"You haven't said what this WON'T do. That matters a lot — what are you explicitly leaving out?"

**Rule 7 — Surface at least one risk proactively.**
The user hasn't considered every risk. Name one they haven't mentioned: "One thing I'd flag: [risk]. Have you thought about how you'd handle that?"

## Topics to cover (organically, any order)

The conversation must touch all of these before moving to synthesis. Don't ask about them in order — let the conversation find them.

1. **Problem** — What specific frustration or need does this solve? For whom?
2. **Success** — What does "done" look like? What would the user do differently once this exists?
3. **Out of scope** — What assumptions should we not make? What are they explicitly NOT building?
4. **Primary user** — One concrete person (or role). Not "users" — a person.
5. **Delivery format** — How does this reach the user? Web? Phone? Automated script? API?
6. **Integrations** — Does it need to talk to anything they already use? (Slack, email, spreadsheets, payment systems, etc.)
7. **Constraints** — Time pressure? Budget? Existing systems it must work with? Team size?
8. **Risks** — What could make this fail or backfire? (Surface one proactively; confirm any the user names.)

## Completion signal

Move to synthesis when ALL of these are true:
- All 8 topic areas above have been touched at least once
- No critical items remain as "I don't know" (who the user is and what success looks like are non-negotiable)
- The user's answers are specific enough to write the outputs in Section "Required outputs" below

If the user gives very short or one-word answers repeatedly, treat as a completion signal and present a draft — the user may be ready even if not every detail is polished.

## Synthesis step

When the completion signal is met, present the full plain-English action plan to the user. Use this exact structure (populated from your running notes):

```
Here's what I have so far — let me know if this captures what you mean.

**What We're Building**
[2–3 sentence plain-language summary]

**Who It's For**
[Concrete persona description]

**What Success Looks Like**
1. [User action / observable outcome]
2. [User action / observable outcome]
3. [User action / observable outcome]

**What It Won't Do**
- [Explicit out-of-scope item]
- [...]

**How It Works**
Format: [web app / mobile / automation / other]
Connects to: [integrations, or "nothing else"]

**Risks to Watch**
- [Plain-language risk]
- [...]

**Open Questions**
- [Anything still unresolved, if any]

---
Does this capture what you want to build?
You can ask me to change or add anything, or say **proceed** and we'll move to the next step.
```

If the user requests changes → resume grilling on the specific area they want to refine, update your notes, and present the synthesis again.

If the user says "proceed" (or equivalent confirmation) → move to Required outputs.

## Required outputs

Produce both files in sequence. Do not skip or reorder.

### 1. `.superbuilder/discovery.md` (user-facing)

Written in plain language, using the user's own words where possible. This is the permanent plain-English record of what was decided. Under one page.

```markdown
# What We're Building
<2–3 sentence summary in plain language>

# Who It's For
<Concrete persona — one person or role, not "everyone">

# What Success Looks Like
1. <User action / observable outcome>
2. <User action / observable outcome>
3. <User action / observable outcome>

# What It Won't Do
- <Explicit out-of-scope item>
- <...>

# How It Works
**Format:** <web app / mobile app / automation / API / other>
**Connects to:** <list of integrations, or "nothing else for now">

# Risks to Watch
- <Plain-language risk>
- <...>

# Open Questions
- <Anything still unresolved — or "None" if all resolved>
```

### 2. `.superbuilder/intake.md` (pipeline-facing)

Auto-translated from `discovery.md` into the technical intake format expected by `01-context-sync`. The user does not need to read or approve this file — it is a mechanical translation. Produce it immediately after writing `discovery.md`.

```markdown
# Intake

**One-liner:** For <persona>, <product> does <X> so that <outcome>.

**Success criteria (3, observable):**
1. <CLI-verifiable criterion derived from success item 1>
2. <CLI-verifiable criterion derived from success item 2>
3. <CLI-verifiable criterion derived from success item 3>

**Out of scope:**
- <item>
- <...>

**Primary user:** <Concrete description>

**Top 3 risks:**
1. <Risk> — mitigation: <1-line mitigation>
2. <Risk> — mitigation: <1-line mitigation>
3. <Risk> — mitigation: <1-line mitigation>

**Constraints:** <Stack, runtime, deployment if the user mentioned any; "none specified" if not>
```

## Hand-off

Once both files are written, confirm to the user:
> "Got it. I've saved a summary to `.superbuilder/discovery.md` — that's your plain-English record of what we decided. Moving to the next step now."

Then hand off to `01-context-sync`. Do NOT skip ahead to PRD.

## Anti-rationalization rules

- "The user seems technical" — still ask the detection question. Discovery is always available; the user chooses.
- "We covered that implicitly" — only counts if explicitly stated. Implicit ≠ captured.
- "The user is getting tired" — if they're giving short answers, present the synthesis draft. Don't skip it.
- "I can fill in the blanks later" — no. If who the user is or what success looks like is unknown, keep grilling.
- "This is taking too long" — time well spent here prevents scope explosion later. One extra question now saves three stories later.
