# AFK Auto-Mode: Combined Capabilities Design

**Companion doc:** [SWOT-ANALYSIS.md](./SWOT-ANALYSIS.md) · **Status:** Design spec, not yet built · **Date:** 2026-05-08

---

## 1. Intent

Combine the five upstream repos (`addyosmani/agent-skills`, `mattpocock/skills`, `mattpocock/sandcastle`, `snarktank/ralph`, `karpathy/autoresearch`) plus existing SuperBuilder gates into a single workflow with **one human touchpoint at the start, one at the end, none in the middle**.

**Human present:** Phase 0 (refine + architect plan), Phase 4 (review final output).
**Agent autonomous:** Phases 1, 2, 3, 5 (execute, self-review, security check, feedback re-execute).
**Maintained throughout:** latest coding/security best practices via live MCP doc lookups (no training-data drift).

**Non-goals:**
- Replace human judgment on "is this the right product."
- Auto-merge to production. Final ship gate is always human.
- Run without sandbox. AFK requires container isolation.

---

## 2. Five-phase flow

```
┌─────────────────────────────────────────────────────────────────┐
│ PHASE 0: Research-and-grill           [HUMAN PRESENT]           │
│   parallel sub-agents fetch latest practices                    │
│   grill human until PRD has zero open questions                 │
│   architect blueprint co-designed with human                    │
│   ↓ human approves & signs PRD hash                             │
├─────────────────────────────────────────────────────────────────┤
│ PHASE 1: Plan freeze                  [AGENT, no human]         │
│   PRD + blueprint hashed (sha256)                               │
│   trust-model boundary lockdown (FORBIDDEN_TOKENS, ALLOWED_PROGS)│
│   sandbox provisioned (Docker by default)                       │
│   carryover state file initialized                              │
├─────────────────────────────────────────────────────────────────┤
│ PHASE 2: Autonomous execute           [AGENT AFK]               │
│   topological sort of user stories from blueprint               │
│   parallel fan-out where dependencies permit                    │
│   per-story Ralph inner loop: implement → gate → fix → repeat   │
│   sandcastle isolates each agent run                            │
│   journal-and-continue on ambiguity (never block)               │
├─────────────────────────────────────────────────────────────────┤
│ PHASE 3: Self-review chain            [AGENT AFK]               │
│   parallel multi-agent: code-reviewer ∥ security-auditor ∥      │
│     test-engineer ∥ architect-validator                         │
│   all must pass; failures feed back to Phase 2 with deltas      │
│   max N inner cycles before escalation                          │
├─────────────────────────────────────────────────────────────────┤
│ PHASE 4: Human review                 [HUMAN PRESENT]           │
│   delivered: PRD, diff, review reports, sandbox trace, journal  │
│   single decision: APPROVE (ship) or FEEDBACK (loop)            │
├─────────────────────────────────────────────────────────────────┤
│ PHASE 5: Feedback loop                [AGENT AFK, scoped]       │
│   feedback diffed against PRD → delta-PRD                       │
│   re-enter Phase 2 with delta scope only                        │
│   bounded by outerLoopBudget; escalate when exhausted           │
└─────────────────────────────────────────────────────────────────┘
```

---

## 3. Phase 0: Research-and-grill (the one phase that earns AFK)

Output of this phase is what makes AFK safe. **No skipping.**

### 3.1 Parallel research fan-out

Before grilling the human, dispatch sub-agents to gather **current** state-of-the-art. Latest-version policy: never rely on training-data-era recommendations.

| Sub-agent | Tool | What it fetches |
|---|---|---|
| `latest-practices` | `context7` MCP | Current API for every library mentioned in user intent |
| `latest-security` | `WebFetch` + OWASP RSS | OWASP Top 10 current, CVE feed for selected stack |
| `latest-cloud` | AWS Knowledge / Microsoft Learn / context7 | If cloud target: current managed-service options |
| `codebase-explorer` | `Explore` agent | If brownfield: file map, entry points, conventions |
| `similar-projects` | `WebSearch` | State-of-art exemplars for this problem class |

Outputs aggregated into `research-dossier.md`. Dossier is read-only input to the grill step.

### 3.2 Structured grilling

Use Pocock's `brainstorming` + `feature-planning` skill semantics:

- Agent asks **one question at a time**, with recommended answer.
- Each answered question reduces ambiguity in PRD draft.
- Loop continues until PRD has **zero `TBD` markers**.
- Human signs the PRD hash to lock.

Mandatory grill topics (non-skippable):
1. **Acceptance criteria** for every user story (verifiable command).
2. **Risk tier** per story (low/medium/high) — gates how much auto-recovery is allowed.
3. **Forbidden tokens & paths** (no-touch zones in code).
4. **Sandbox provider** choice (Docker/no-sandbox/Vercel/Daytona).
5. **Review depth** (light = single reviewer / heavy = full multi-agent chain).
6. **Outer-loop budget** (max feedback cycles before human escalation).
7. **Optimization targets** (if any) — Karpathy-style scalar gates.
8. **Fallback policy** when agent blocks: journal-and-continue OR pause-for-human.

### 3.3 Co-architecting

After grill, dispatch `feature-dev:code-architect` to produce file-level blueprint. Human reviews + edits in IDE. **This is the final human-edit window.** Once signed, blueprint is immutable input to Phase 1.

---

## 4. Plan artifact schema

```jsonc
{
  "projectId": "afk-2026-05-08-auth-feature",
  "intent": "Add SSO login with passkey fallback",
  "createdAt": "2026-05-08T12:00:00Z",
  "prdHash": "sha256:...",                   // signed by human

  // Sandbox & safety (Phase 1 inputs)
  "sandboxProvider": "docker",                // docker|podman|vercel|daytona|none
  "allowedPrograms": ["bun","node","git","docker","jq"],
  "forbiddenTokens": ["TODO","FIXME","XXX"],
  "forbiddenPaths": [".env","secrets/","prod-config/"],
  "trustModelHash": "sha256:...",

  // Loop budgets
  "outerLoopBudget": 3,                       // max human-feedback cycles
  "innerIterationDefault": 5,                 // per-story Ralph iterations
  "wallClockBudgetSec": 7200,

  // Review chain (Phase 3)
  "reviewDepth": "heavy",                     // light|heavy
  "reviewers": ["code-reviewer","security-auditor","test-engineer","architect-validator"],

  // User stories (feature work)
  "userStories": [
    {
      "id": "US-001",
      "title": "User can log in via Google SSO",
      "riskTier": "high",
      "acceptanceCmd": "bun test src/auth/sso.test.ts",
      "iterationBudget": 5,
      "fallbackOnBlock": "journal+continue",
      "requiredArtifacts": ["src/auth/sso.ts","test/auth/sso.test.ts"],
      "dependencies": []
    }
  ],

  // Optimization targets (Karpathy-style scalar gates)
  "optimizationTargets": [
    {
      "id": "OPT-001",
      "targetFile": "src/auth/session.ts",
      "fenceFiles": ["test/auth/session.test.ts"],
      "benchCmd": "bun run bench:session",
      "scalarRegex": "^p99_ms: (\\d+\\.\\d+)$",
      "minimize": true,
      "keepMargin": 0.05,
      "iterationBudget": 20
    }
  ],

  // Architect blueprint (file-level plan)
  "blueprint": {
    "filesToCreate": [
      {"path":"src/auth/sso.ts","exports":["ssoHandler"]},
      {"path":"test/auth/sso.test.ts","testsFor":["ssoHandler"]}
    ],
    "filesToModify": [
      {"path":"src/server.ts","changes":"mount /auth/sso router"}
    ],
    "filesToDelete": []
  },

  // Latest-practices snapshot (Phase 0 research)
  "researchDossier": {
    "fetchedAt": "2026-05-08T11:55:00Z",
    "sources": [
      {"lib":"hono","version":"4.x","source":"context7"},
      {"std":"OWASP-2025-A07","source":"owasp.org/Top10"}
    ]
  }
}
```

---

## 5. Phase 2: Autonomous execute

### 5.1 Topological scheduling

Build dependency DAG from `userStories[].dependencies`. Independent stories run in **parallel sandboxes** (Sandcastle gives us this for free).

### 5.2 Per-story Ralph inner loop

Each story executes in its own sandbox:

```
loop:
  load PRD + carryover state
  read story acceptance criteria
  call claudeCode(prompt = build("US-XXX"))
  run acceptance command
  if pass:                    -> commit, write to carryover, exit loop
  if fail and iters < budget: -> capture error, loop with diagnostic context
  if fail and iters == budget:-> mark BLOCKED, journal, continue topo
  if ambiguity hit mid-build: -> sub-agent resolve OR journal-and-continue
                                 (per fallbackOnBlock policy)
```

Carryover format: append-only JSONL (Ralph's `progress.txt` analog), one line per iteration with `{storyId, iter, status, hash, ts, summary}`.

### 5.3 Optimization-target inner loop (Karpathy mode)

For `optimizationTargets`, propose-measure-keep/discard:

```
loop:
  propose patch (sandbox)
  run benchCmd, parse scalarRegex -> measure
  compare to current best:
    minimize=true: if measure < best * (1 - keepMargin) -> keep
    minimize=false: if measure > best * (1 + keepMargin) -> keep
  else: discard, revert
  loop until iterationBudget exhausted
```

Optimization runs after feature stories complete (so we optimize working code, not broken code).

### 5.4 Ambiguity protocol (the AFK guarantee)

When agent hits an unspecified situation:

1. **First**, dispatch a `general-purpose` sub-agent with full context to resolve from PRD + dossier.
2. If sub-agent confident: proceed, journal `{type:"resolved",reason:...}`.
3. If sub-agent uncertain AND `fallbackOnBlock == "journal+continue"`: pick safe default (least-destructive option), journal `{type:"deferred",options:[...]}`, continue.
4. If `fallbackOnBlock == "pause-for-human"`: stop story, mark `BLOCKED_AWAITING_HUMAN`, continue with other stories.

Never silent-skip. Every deferral is one journal line that surfaces in Phase 4 review.

---

## 6. Phase 3: Self-review chain

All reviewers run in **parallel sub-agents**, each with read-only access to diff + PRD + journal.

| Reviewer | Source | Pass criterion |
|---|---|---|
| `code-reviewer` | SuperBuilder + Pocock `code-review` | No CRITICAL or HIGH severity findings |
| `security-auditor` | SuperBuilder existing | No vuln matching OWASP-2025 list from dossier |
| `test-engineer` | SuperBuilder + Pocock `tdd` discipline | All acceptance commands pass; coverage ≥ baseline |
| `architect-validator` | New (from Pocock `feature-planning`) | Blueprint adherence: all `filesToCreate` exist, no out-of-scope new files |

**Aggregation:** all four must return `pass`. Any `fail` triggers re-entry to Phase 2 scoped to the failing story. Bounded by `innerIterationDefault` retries before kicking to Phase 4 with `BLOCKED` status.

**Why parallel:** four reviewers each take 1-3 minutes. Serial = 8-12 min, parallel = 3 min ceiling.

---

## 7. Phase 4: Human review (the second touchpoint)

Delivered package:

```
docs/afk-runs/<runId>/
├── PRD.json                  # signed plan
├── prd-hash.txt              # sha256
├── DIFF.patch                # full git diff vs base
├── BLUEPRINT-DELTAS.md       # what differs from blueprint
├── review-reports/
│   ├── code-reviewer.json
│   ├── security-auditor.json
│   ├── test-engineer.json
│   └── architect-validator.json
├── journal.jsonl             # every deferred decision
├── sandbox-trace.log         # sandcastle stream events
└── SUMMARY.md                # human-readable digest
```

`SUMMARY.md` contains: stories shipped, stories BLOCKED, deferred decisions count, security findings count, optimization deltas. Human's only decisions:

- **APPROVE** → tag, proceed to ship gate (existing SuperBuilder `superreview` + `ship` flow).
- **FEEDBACK** → write feedback notes; trigger Phase 5.

---

## 8. Phase 5: Feedback loop (bounded re-execute)

1. Human's feedback notes parsed by `feedback-diff` sub-agent.
2. Output: `delta-PRD.json` with only changed/added/removed stories.
3. Re-enter Phase 2 scoped to delta. Phases 3 + 4 still run.
4. Loop until `outerLoopBudget` exhausted OR human approves.
5. On budget exhaustion: escalate — package full history and request human re-architect (re-enter Phase 0).

---

## 9. Capability sourcing matrix

| SuperBuilder feature | Source | Usage |
|---|---|---|
| Five-phase orchestration | New (this doc) | Top-level driver |
| Pre-flight grilling | Pocock `brainstorming`, `feature-planning` | Phase 0 |
| Latest-practices fetch | `context7` MCP (existing), Microsoft Learn MCP, AWS MCP | Phase 0 dossier |
| Sandbox isolation | `@ai-hero/sandcastle ^0.5.x` (already a dep) | Phase 2 per-story |
| Provider abstraction | Sandcastle's Docker/Podman/Vercel/Daytona | Phase 1 selection |
| Ralph inner loop | Pattern from `snarktank/ralph` (no code copy) | Phase 2 per-story loop |
| Carryover JSONL | Pattern from Ralph `progress.txt` | Phase 2 + Phase 5 |
| Karpathy propose-measure-keep | Pattern from `karpathy/autoresearch` (no code copy) | Phase 2 optimization |
| FORBIDDEN_TOKENS / ALLOWED_PROGRAMS | SuperBuilder existing | Phase 1 + 2 |
| trust-model SHA-256 | SuperBuilder existing | Phase 1 lockdown |
| Multi-agent review chain | SuperBuilder `superreview` + Pocock `code-review` | Phase 3 |
| TDD discipline | Pocock `tdd` skill | Phase 3 test-engineer reviewer |
| Code-architect blueprint | `feature-dev:code-architect` (existing agent) | Phase 0 architecting |
| Ship gate | SuperBuilder `ship` (existing) | Post-Phase-4 |
| Skill packs (general-purpose) | `addyosmani/agent-skills` (curated) | Phase 0 + 2 supporting skills |

---

## 10. Build sequence

Order matters: each step is shippable on its own.

1. **v0.2** — `setup-prd` produces hybrid PRD+blueprint with the schema above. `grill-me` skill integration. Research dossier sub-agent fan-out.
2. **v0.3** — Phase 2 driver: topological scheduler + per-story Ralph loop in sandcastle, JSONL carryover. (No optimization mode yet.)
3. **v0.4** — Phase 3 parallel review chain. Add `architect-validator` reviewer.
4. **v0.5** — Phase 4 packaging + SUMMARY.md generator. Phase 5 delta-PRD logic.
5. **v0.6** — Optimization-target mode (Karpathy). Hybrid features + scalars in same PRD.
6. **v1.0** — Hardening: latest-practices freshness checks, MCP fallbacks, sandbox-failure recovery, telemetry.

**Critical path** for first AFK run: v0.2 + v0.3 + v0.4 + v0.5. Optimization is v0.6 (post-MVP).

---

## 11. Failure modes & escapes

| Mode | Detection | Recovery |
|---|---|---|
| Sandbox crash mid-run | Sandcastle stream closes | Resume from JSONL carryover, mark iteration BLOCKED, continue |
| MCP doc-fetch outage | context7 timeout | Fall back to WebFetch; if both fail, Phase 0 halts (refuse AFK without fresh dossier) |
| Reviewer flake (false positive) | Re-run on suspicion; if 3 reruns disagree, surface to human | |
| Outer budget exhausted | `outerLoopBudget == 0` | Escalate to Phase 0 with failure history |
| Forbidden token introduced | trust-model gate at commit | Reject commit, journal, retry from prior state |
| Optimization stuck (no improvement) | `keepMargin` not crossed for N iters | Stop OPT-XXX, journal best-so-far, continue |
| Network down (no MCP, no Web) | Pre-flight check at Phase 0 entry | Refuse to start. AFK requires fresh dossier. |
| Disk full / OOM in sandbox | Sandcastle health probe | Kill sandbox, surface to Phase 4 with `INFRA_FAILURE` |

---

## 12. Deferred trade-offs (non-blocking, defaults chosen)

These are locked at sensible defaults; can revisit when concrete pain emerges.

| Decision | Default | Why |
|---|---|---|
| Sandcastle pinning | `~0.5.8` (patch-only) | Pre-1.0, breaking changes ship in patches |
| Vendor-fork sandcastle | No, npm dep | Maintenance cost too high; tight pin sufficient |
| Carryover format | JSONL append-only | Ralph-proven, easy to grep, easy to truncate-and-replay |
| Optimization mode in v1.0 | No, v0.6 | Optimization is a different gate kind; ship features first |
| `--dangerously-allow-all` | Never available | Defeats the safety ridge; design rejects it |
| Karpathy code copy | None | Patterns only; license unclear, copying not needed |
| Skill-pack distribution | Git submodule | Vendor copies stale fast; submodule pins explicitly |
| Pre-flight grill skip | Not allowed | Skipping it nullifies the AFK safety claim |
| `program.md` naming | `OPTIMIZE.md` inside `prd/` | Avoids collision with Karpathy upstream filenames |
| SessionStart hook pattern | Reuse existing SuperBuilder | No reason to rebuild |

---

## 13. Open questions for human (only these need an answer before v0.2 build)

1. **Risk tiering granularity** — three tiers (low/med/high) or five (add critical, trivial)?
2. **Outer loop hard-cap** — should there be an absolute max regardless of budget (e.g., never more than 5 cycles per project)?
3. **Notification on Phase 4 entry** — push notification, email, or just IDE indicator? Affects how AFK the user can really go.
4. **Ship gate authority** — does Phase 4 approval auto-ship, or always require a separate human-typed `ship`?
5. **Cost ceiling** — should PRD include a `maxApiSpend` that aborts the run if exceeded?

Everything else is decided in §12 with defaults that can be revisited.

---

**End of design.** Next action gated on answers to §13.
