# SuperBuilder: Composition from 5 Upstream Repos — SWOT & Combination Analysis

> **Status:** Research artifact only. No commits. No code changes. Decisions deferred to user.
> **Date:** 2026-05-07 (rewritten after scope correction)
> **Scope:** SuperBuilder built from a curated mix of 5 upstream repos; **NOT** compared against the broader installed Claude Code ecosystem.
> **Identity under analysis:** "Long autonomous run that ships verifiable code, safely, from a PRD."

## Scope-correction note

An earlier draft of this doc compared SuperBuilder against the user's full installed Claude Code ecosystem (~30 plugins, ~150 skills). That scope was wrong. The user's actual intent: **SuperBuilder is composed from a curated combination of skills/patterns from these 5 repos only.** This rewrite drops everything ecosystem-wide and focuses exclusively on the 5 named repos.

The 5 repos under analysis:

1. [`addyosmani/agent-skills`](https://github.com/addyosmani/agent-skills) (and [/releases](https://github.com/addyosmani/agent-skills/releases)) — production-grade engineering skills
2. [`mattpocock/skills`](https://github.com/mattpocock/skills) — Pocock's "skills for real engineers"
3. [`mattpocock/sandcastle`](https://github.com/mattpocock/sandcastle) — sandboxed coding-agent orchestration TS lib (already in use as `@ai-hero/sandcastle`)
4. [`snarktank/ralph`](https://github.com/snarktank/ralph) — canonical "Ralph Wiggum" autonomous-loop pattern
5. [`karpathy/autoresearch`](https://github.com/karpathy/autoresearch) — propose→measure→keep/discard ML-research loop

---

## 1. Methodology

Five parallel deep-dive agents, one per repo. Each performed exhaustive inventory: every skill, agent, hook, command, file in tree, public API surface, release history, design philosophy.

For each artifact across all 5 repos, the synthesis below tags one of:
- **ABSORB** — copy/install verbatim into SuperBuilder
- **ADAPT** — useful pattern, modify for SuperBuilder's gate model / autonomy posture
- **SKIP** — out of scope or actively conflicts
- **REPLACE** — already done better in SuperBuilder; do not import

---

## 2. SuperBuilder current state (preserved)

| Surface | Count | Notes |
|---|---|---|
| Slash commands | 7 | `/superbuilder:superaudit`, `superbuild`, `superreview`, `superheal`, `supership`, `supersources`, `superstatus` |
| Agents | 11 | reviewer, security-auditor, test-engineer, architect, planner, implementer, context-cartographer, product-griller, release-manager, self-improvement-researcher, source-update-auditor |
| Hooks | 5 events / 6 scripts | block-dangerous-bash, block-secret-writes, advisory prompt-hook, capture-evidence (PostToolUse), verify-stop, load-superbuilder-context (SessionStart), write-final-state (SessionEnd, partial) |
| Skills | 12 phases | 00-intake-refine → 11-update-sources |
| CLI verbs | 5 | run, validate, sources, gates, heal |
| Security guards | 8+ | allow-list (51 programs), FORBIDDEN_TOKENS regex, HIGH_RISK_PROGRAMS opt-in (10 programs), SHA-256 policy hash, sandbox isolation, deterministic deny-list, secret-write block, evidence requirement |
| Tests | 153 passing | After PR #19 |
| **Runtime substrate** | `@ai-hero/sandcastle ^0.5.8` | Confirmed in `orchestrator/package.json:29` and `orchestrator/src/sandcastle-runner.ts:9-16` |

Mission: PRD → orchestrate stories in sandbox → run gates → heal on failure → ship verified code.

---

## 3. Per-repo deep inventory

### 3.1 `addyosmani/agent-skills` v0.6.0

| Field | Value |
|---|---|
| Stars | 33,206 · MIT · last push 2026-05-07 |
| Releases | `0.6.0` (2026-04-28), `0.5.0` (2026-04-10) |
| Components | 21 skills · 3 agents · 1 registered hook (+4 unregistered helper scripts) · 7 commands |
| Plugin manifest | `.claude-plugin/plugin.json` with `name: "agent-skills"`, declares commands/skills/agents |

**Skills (21):**

| # | Skill | Cluster | Tag |
|---|---|---|---|
| 1 | spec-driven-development | Planning | ABSORB |
| 2 | planning-and-task-breakdown | Planning | ABSORB |
| 3 | idea-refine | Planning | SKIP (orthogonal) |
| 4 | context-engineering | Planning | ADAPT |
| 5 | source-driven-development | Planning | ABSORB |
| 6 | incremental-implementation | Build | ABSORB |
| 7 | test-driven-development | Build/TDD | ABSORB (+ Prove-It pattern for bugs) |
| 8 | api-and-interface-design | Build | ADAPT |
| 9 | frontend-ui-engineering | Frontend | SKIP (stack-specific) |
| 10 | browser-testing-with-devtools | Frontend/Test | SKIP |
| 11 | code-review-and-quality | Review | ABSORB (5-axis rubric) |
| 12 | code-simplification | Review | ADAPT (post-heal cleanup pass) |
| 13 | debugging-and-error-recovery | Debug | ABSORB (heal-loop core) |
| 14 | security-and-hardening | Security | ABSORB |
| 15 | performance-optimization | Performance | ADAPT (gate-able) |
| 16 | ci-cd-and-automation | Ship | ADAPT |
| 17 | shipping-and-launch | Ship | ABSORB |
| 18 | git-workflow-and-versioning | Ship | ADAPT |
| 19 | deprecation-and-migration | Ship | SKIP |
| 20 | documentation-and-adrs | Docs | ADAPT (emit ADR on heal-loop diverge) |
| 21 | using-agent-skills | Meta | ADAPT (SessionStart-injected pattern is gold) |

**Agents (3):** code-reviewer · security-auditor · test-engineer — all **ABSORB** (drop-in for SuperBuilder's review/security/test gates).

**Hooks:** SessionStart `session-start.sh` (jq-escaped meta-skill injection) — **ADAPT** the pattern.

**Commands (7):**
- `/spec` `/plan` `/build` `/test` `/review` `/code-simplify` — ABSORB or ADAPT
- `/ship` — **REPLACE.** Skip threshold ("≤2 files, <50 lines, no auth/payments/data/config") punches a hole in SuperBuilder's gate model. Keep parallel-fan-out pattern, drop the threshold OR relocate it behind `--allow-trivial` audit-logged flag.

**Releases:**
- v0.6.0 (Apr 28): 3-layer model formalized (Personas/Skills/Slash commands; user is sole orchestrator); `/ship` parallel-fan-out; SessionStart hook jq-hardened; multi-tool support (Gemini, Kiro, OpenCode)
- v0.5.0 (Apr 10): source-driven-development added; performance-optimization expanded; spec/task lifecycle clarified

### 3.2 `mattpocock/skills`

| Field | Value |
|---|---|
| Stars | 65,099 · MIT · last push 2026-05-08 |
| Components | 26 skills · 0 agents · 0 registered hooks (1 hook script payload) · 0 commands |
| Plugin manifest | `.claude-plugin/plugin.json` with `name: "mattpocock-skills"`, **skills-only** layout |
| Install | `npx skills@latest add mattpocock/skills` (third-party `skills.sh` installer) |

**Skills (13 registered + 13 personal/in-progress/deprecated):**

| Cluster | Skill | Tag | Conflict w/ autonomy |
|---|---|---|---|
| Alignment | grill-me | ADAPT (pre-flight only) | HIGH |
| Alignment | grill-with-docs | ABSORB (pre-flight + CONTEXT.md/ADR) | HIGH |
| Alignment | zoom-out | ABSORB (in-loop context recovery) | LOW |
| Spec | to-prd | ABSORB (non-interactive) | NONE |
| Spec | to-issues | ABSORB (tracer-bullet decomposition) | NONE |
| Spec | triage | ADAPT | LOW |
| Spec | prototype | ADAPT (spike-stage before story) | MED |
| Build | tdd | ABSORB (red-green-refactor + 5 ref docs: deep-modules, interface-design, mocking, refactoring, tests) | NONE |
| Build | diagnose | ADAPT (strip HITL `read -r -p` blocking) | MED |
| Arch | improve-codebase-architecture | ABSORB (periodic audit) | LOW |
| Setup | setup-matt-pocock-skills | REPLACE | n/a |
| Setup | write-a-skill | ABSORB | NONE |
| Setup | git-guardrails-claude-code | REPLACE (SB has stronger gates) | LOW |
| Setup | setup-pre-commit | SKIP | n/a |
| Setup | scaffold-exercises | SKIP | n/a |
| Setup | migrate-to-shoehorn | SKIP | n/a |
| Comm | caveman | ABSORB (token-saver) | NONE |
| Personal | edit-article, obsidian-vault | SKIP | n/a |
| In-progress | handoff | ADAPT (inter-agent handoff fits SB sub-agent dispatch) | LOW |
| In-progress | writing-beats/fragments/shape | SKIP | n/a |
| Deprecated | design-an-interface | **ADAPT-CONSIDER** (parallel sub-agents fan-out — most directly transferable orchestration primitive in the repo, despite deprecation) | NONE |
| Deprecated | qa, request-refactor-plan, ubiquitous-language | SKIP | n/a |

**Pocock's design philosophy (verbatim):**
> "Approaches like GSD, BMAD, and Spec-Kit try to help by owning the process. But while doing so, they take away your control and make bugs in the process hard to resolve."
>
> "These skills are designed to be small, easy to adapt, and composable. They work with any model."
>
> "The most common failure mode in software development is misalignment… The fix for this is a grilling session."

**Tension:** Pocock favors human-control + grilling-before-code. SuperBuilder favors autonomous-with-gates. Resolution: Pocock's **artifacts** (PRD, issues, ADR/CONTEXT, TDD discipline, deny-list hook) absorb cleanly; Pocock's **grilling sessions** sit upstream of the autonomous loop, never inside it.

### 3.3 `mattpocock/sandcastle` (= `@ai-hero/sandcastle`)

| Field | Value |
|---|---|
| Stars | 3,899 · MIT · last push 2026-05-07 |
| Releases | 7 in last 30 days; latest `0.5.8` (2026-05-06); `0.5.9` unreleased on `main` |
| Bus-factor | 1 (mattpocock = ~96% of commits) |
| **SuperBuilder relationship** | **Already a core dependency** — `orchestrator/package.json:29` and `sandcastle-runner.ts:9-16`. Not "absorb" but "extend usage." |

**API surface SuperBuilder uses TODAY:**
- `createSandbox` (alias `scCreateSandbox`)
- `claudeCode("claude-opus-4-7")`
- `Sandbox.run({ agent, promptFile, maxIterations, name, idleTimeoutSeconds })`
- `Sandbox.close`
- `[Symbol.asyncDispose]`
- `SandboxHooks.sandbox.onSandboxReady` (for `pnpm install` / `npm ci`)
- `SandboxRunResult.commits[].sha` (only field consumed)
- Subpath imports: `/sandboxes/docker`, `/sandboxes/podman`, `/sandboxes/vercel`

**API surface SuperBuilder is NOT using (high-value extensions):**

| Capability | Tag | Why |
|---|---|---|
| `createWorktree` + `wt.run/interactive/createSandbox` | **ABSORB** | Worktree-only (no container) for cheap local agent loops; promote to docker for AFK runs. Maps cleanly to "one story = one branch." |
| Explicit `branchStrategy: { type: "branch", branch: "story/<id>" }` | **ABSORB** | Currently relies on implicit `head` default; explicit branch makes commits land deterministically and is safer for parallel stories |
| `Output.object({ tag, schema })` / `Output.string({ tag })` | **ABSORB** | Schema-validated agent output replaces ad-hoc text parsing for gate signals |
| `logging.onAgentStreamEvent` | **ABSORB** | Forward agent stream to telemetry / live log viewer / SSE bus |
| `IterationUsage` (token counts) | **ABSORB** | Per-story budget enforcement / cost telemetry |
| `AbortSignal` on `Sandbox.run` | **ABSORB** | Orderly cancellation when scheduler kills a stuck story (currently no kill switch) |
| `mounts: [{hostPath: "~/.npm", ...}]` | **ABSORB** | Massive install-time speedup via package-manager cache bind-mount |
| `promptArgs` + `{{KEY}}` placeholders (built-ins `{{SOURCE_BRANCH}}`/`{{TARGET_BRANCH}}`) | **ABSORB** | Templates take parameters instead of generating prompt files dynamically |
| `host.onWorktreeReady` / `host.onSandboxReady` hooks | **ADAPT** | Host-side `git fetch`, `cp .env`, etc. before container start |
| `copyToWorktree: [".env", ...]` | **ADAPT** (security review) | Move secrets in without baking into image |
| `resumeSession` | **ADAPT** | Continue prior Claude session for self-heal retries (incompatible with `maxIterations > 1`) |
| `noSandbox()` provider | **ADAPT** (only inside hardened gates) | Useful for diagnostic / read-only passes |
| `interactive()` / `wt.interactive()` | **ADAPT** | TUI seat — `superbuilder shell <story>` debugging command |
| Custom provider factories | **SKIP** (until needed) | Future gvisor/firecracker-local |

**Risk surface:**
- Pre-1.0 semver — patch versions ship breaking renames (0.4.8 `TimeoutError` → `AgentIdleTimeoutError`; 0.4.8 `Workspace*` → `Worktree*` mass rename)
- 0.5.0 hooks shape change (flat → `{host, sandbox}` grouping)
- Recommendation: switch from `^0.5.8` to `~0.5.8` (patch-only) to prevent silent absorption of next minor

### 3.4 `snarktank/ralph`

| Field | Value |
|---|---|
| Stars | 18,706 · MIT · last push 2026-02-02 (effectively unmaintained ~3 months) |
| Components | 1 bash script (~120 lines) · 2 skills (`prd`, `ralph`) · 1 prompt template |
| Origin | Implementation of Geoffrey Huntley's "Ralph Wiggum" pattern |

**The entire engine in one quote (`ralph.sh`):**

```bash
for i in $(seq 1 $MAX_ITERATIONS); do
  if [[ "$TOOL" == "amp" ]]; then
    OUTPUT=$(cat prompt.md | amp --dangerously-allow-all 2>&1 | tee /dev/stderr) || true
  else
    OUTPUT=$(claude --dangerously-skip-permissions --print < CLAUDE.md 2>&1 | tee /dev/stderr) || true
  fi
  if echo "$OUTPUT" | grep -q "<promise>COMPLETE</promise>"; then exit 0; fi
  sleep 2
done
```

**`prd.json` shape (verbatim):**

```json
{
  "project": "MyApp",
  "branchName": "ralph/task-priority",
  "description": "...",
  "userStories": [
    {
      "id": "US-001",
      "title": "...",
      "description": "...",
      "acceptanceCriteria": ["...", "Typecheck passes"],
      "priority": 1,
      "passes": false,
      "notes": ""
    }
  ]
}
```

**Mechanisms — absorption matrix:**

| Mechanism | Tag | Reasoning |
|---|---|---|
| Bash-loop driver (~120 lines) | **REPLACE** | Wrong substrate for SB's gates, audit log, trust-model. SB's TS CLI is the right home. Keep conceptual shape (cap + completion sentinel + sleep). |
| `prd.json` shape | **ABSORB-WITH-EXTENSION** | Excellent minimal shape. Adopt as-is, extend with `riskTier`, `verificationCommand`, `requiredArtifacts`, `iterationBudget`. |
| `progress.txt` carryover | **ADAPT** | Two-tier (per-iter entries + Codebase Patterns) is the right structure. Switch to JSONL + human markdown rendering. Make append-only via tooling (not trust). |
| Fresh-agent-per-iter discipline | **ABSORB** | Central insight. Stale context across iterations is #1 failure mode of long agent runs. |
| Auto-archive on branch change | **ABSORB** | Cheap state hygiene SuperBuilder may not have. |
| Story-priority selection (lowest-int where `passes==false`) | **ABSORB** | Dead-simple, deterministic, debuggable. |
| `<promise>COMPLETE</promise>` stdout sentinel | **ADAPT** | Sentinel-in-stdout is fragile (false positives). Use exit code or structured output channel. |
| "Gate is just tests passing" minimal safety model | **REPLACE** | SB's biggest delta over Ralph. Keep SB's gate stack; do not regress. |
| `--dangerously-allow-all` / `--dangerously-skip-permissions` | **REPLACE** | Direct conflict with SB's risk-tier model. Keep permission gates on. |
| Auto-handoff at 90% context (Amp-only) | **SKIP** | Vendor-specific external setting; Claude Code has its own compaction. |
| `AGENTS.md` / `CLAUDE.md` auto-updates near edited files | **ADAPT** | Good idea but currently unaudited. Surface as gate diff or guarded namespace. |

**Ralph's safety gaps (what SB must NOT regress):**
- No verification gate in the loop — bash never runs `npm test` / `tsc`
- No diff review / no human-in-the-loop / no PR step
- No allow-list of tools / paths
- No iteration budget per story
- `progress.txt` agent-written, never validated → poisonable across iterations

### 3.5 `karpathy/autoresearch`

| Field | Value |
|---|---|
| Stars | 79,584 · last push 2026-03-26 · License unclear (README says MIT, no LICENSE file) |
| Components | 10 files · 1 `program.md` (the "skill") · 1 `train.py` (the iterated artifact) · no driver script |
| Mission | "AI agents running research on single-GPU nanochat training automatically" |

**The outer loop (verbatim from `program.md`):**

```
LOOP FOREVER:
1. Look at git state
2. Tune train.py with an experimental idea
3. git commit
4. Run experiment: uv run train.py > run.log 2>&1
5. Read results: grep "^val_bpb:\|^peak_vram_mb:" run.log
6. If empty, run crashed — tail -50 run.log, attempt fix, give up after few tries
7. Record results in tsv (untracked)
8. If val_bpb improved (lower), advance branch, keep commit
9. If val_bpb equal/worse, git reset to where you started
```

**Mechanism table:**

| Concern | Karpathy approach |
|---|---|
| Propose | Agent hacks `train.py` directly with experimental idea |
| Measure | Fixed 5-min wall-clock training (`TIME_BUDGET = 300`) → `evaluate_bpb` |
| Decision | Strict scalar `<` on `val_bpb`. No statistical test. Tie → discard. |
| Baseline | Git branch HEAD as moving baseline; `git reset --hard` to revert losers |
| Fence | Honor system. Agent forbidden from editing `prepare.py` (which owns the eval). No hook, no test, no CI lock. |
| Sandbox | None. Bare-metal Linux/H100 with `--dangerously-skip-permissions` |
| Anti-cheat | Strong: agent can't edit `prepare.py` → val_tokens fixed → no path to overfit val set without breaking the fence |

**`program.md` vs SKILL.md:**

| Dimension | program.md | SKILL.md |
|---|---|---|
| Discovery | Manual | Auto-loaded by description match |
| Frontmatter | None | YAML name/description |
| Scope | One repo, one task forever | Reusable across repos/tasks |
| Mutability | Human edits between sessions; never the agent | Human edits |

**Absorption matrix:**

| Pattern | Tag | Reasoning |
|---|---|---|
| Propose→measure→keep/discard outer loop | **ABSORB** | Validates SB's heal-loop discipline |
| Single-file iteration scope | **ADAPT** | SB's story-graph is multi-file. Adopt for a *perf-tuning slot only* (one file, one bench) |
| `program.md` (human) vs `train.py` (agent) split | **ABSORB** | Mirrors SKILL.md vs codebase. Already idiomatic in plugin form |
| Wall-clock-bounded measurement | **ADAPT** | SB gates are pass/fail; add a budgeted-bench gate as new gate kind |
| No-sandbox + permissions-disabled posture | **SKIP** | SB ships gates and audit logging; Karpathy's posture is hostile — keep gates |
| Simple keep-if-better decision rule | **REPLACE** | For perf scalars: keep-if-better-by-margin (epsilon for noise) + simplicity tiebreaker. Pure `<` is too noisy in code-bench land. |
| "NEVER STOP" autonomy clause | **ADAPT** | Useful for overnight runs; `--autonomous` flag, not baked into prompt |
| Git-branch-as-baseline | **ABSORB** | Cleaner than file-copy; reset-on-discard is free |
| TSV results log, untracked | **ABSORB** | Lightweight, greppable, doesn't pollute history |
| Crash → revert, soft-fix-typos rule | **ABSORB** | Cheap robustness |

**Replication outside ML training:**

| Karpathy artifact | SuperBuilder transfer |
|---|---|
| `train.py` | Single hot module / file under iteration (e.g. `pkg/core/optimizer.ts`) |
| `val_bpb` | Composite scalar: weighted (test_pass_rate, p95_latency_ms, bundle_size_kb), or single perf bench when correctness is fence-protected by frozen tests |
| `prepare.py` (fixed eval) | Frozen test suite + bench harness — agent forbidden to touch |
| 5-min training | Bench wall-clock budget (e.g. `bun bench` capped at 60s) |
| `evaluate_bpb` | Make target: `make bench` emits `score: <float>` |

The Karpathy pattern transfers cleanly to **performance tuning** where there's a frozen correctness oracle (tests) + a noisy-but-orderable scalar (latency, throughput, bundle size). Transfers poorly to feature work, where there's no scalar.

---

## 4. Per-repo SWOT (side-by-side)

| Axis | addyosmani/agent-skills | mattpocock/skills | mattpocock/sandcastle | snarktank/ralph | karpathy/autoresearch |
|---|---|---|---|---|---|
| **Strengths** | Mature SDLC skill set covering full intake-to-ship; semver releases; multi-tool support; 5-axis review rubric; parallel-fan-out `/ship` pattern | High-quality grilling skills; explicit anti-BMAD philosophy that *complements* SB's autonomy posture (pre-flight discipline); deprecated `design-an-interface` parallel-sub-agent pattern is gold | Already in production use; battle-tested provider abstraction (Docker/Podman/Vercel/Daytona); rich unused surface (worktrees, AbortSignal, Output.object, branchStrategy, mounts) | Radical simplicity (~120 lines); battle-tested `prd.json`/`progress.txt`/fresh-iter triad on 18.7k stars; intellectual antecedent of SB's loop pattern | Cleanest articulation of propose→measure→keep/discard discipline; `program.md` framing as "lightweight skill"; strong anti-cheat fence pattern; demonstrates a research-loop variant SB doesn't have |
| **Weaknesses** | `/ship` skip threshold punches a hole in gate model; commands declare no `tools:` allowlist; no sandbox/orchestration primitives; no heal-loop | Skills are alignment-focused not execution-focused; HITL `read -r -p` template incompatible with autonomous runs; explicitly opposes process-owning tools (anti-SB framing) | Pre-1.0 semver (breaking renames in patch versions); bus-factor 1; 63 open issues / 32 PRs backlog | Bash-only driver; no audit log; no allow-list; `--dangerously-skip-permissions` posture; agent-written `progress.txt` is poisonable; effectively unmaintained 3 months | Honor-system fence (no hook/test/CI lock); no-sandbox + permissions-disabled posture; no convergence detection (loops FOREVER); license unclear (README says MIT, no LICENSE file) |
| **Opportunities for SB** | Adopt `/spec→/plan→/build→/test→/review→/ship` SDLC commands; absorb 3 review agents; pin `agent-skills@0.6.0` and re-pin per release | Pre-flight grilling layer above SB's autonomous run; `to-prd`/`to-issues` non-interactive synthesis; CONTEXT.md/ADR discipline as authoring gate; `tdd` skill's 5 ref docs | Adopt `createWorktree` for cheap local loops; `branchStrategy: branch` for parallel-story safety; `Output.object` for typed gate signals; `IterationUsage` for budget telemetry; `AbortSignal` for kill switches; `mounts` for cache speed | Adopt `prd.json` shape (with extensions); `progress.txt` JSONL carryover (tooling-enforced); fresh-agent-per-iter as bash-replaced TS discipline; auto-archive-on-branch | Add `optimize` gate kind for perf tuning (alongside `tests`/`build`/`lint`); per-target `OPTIMIZE.md` analog of `program.md`; git-branch-as-baseline with reset-on-discard; TSV results log |
| **Threats / risks** | Absorbing `/ship` skip-threshold verbatim regresses SB's gate model; commands without `tools:` allowlist regress trust posture | Absorbing grilling skills into in-loop position conflicts with autonomy; replacing SB's PRD authoring with `to-prd` loses risk-tier metadata | Library API breaks on minor bumps; bus-factor-1 maintenance lapse blocks all autonomous runs; no documented fork/mirror policy | Inheriting Ralph's "trust the agent ran tests" gate model regresses safety; `--dangerously-skip-permissions` invocation pattern conflicts with SB's risk model | Inheriting "no convergence detection" causes runaway costs; license ambiguity = unsafe to copy code verbatim until clarified |

---

## 5. Cross-repo overlaps & resolutions

When 2+ repos cover the same capability, pick a winner or merge.

| Capability | addyosmani | mattpocock/skills | sandcastle | ralph | karpathy | **Resolution** |
|---|---|---|---|---|---|---|
| **TDD** | `test-driven-development` (Prove-It bug pattern) | `tdd` (5 ref docs: deep-modules, interface-design, mocking, refactoring, tests) | — | — | — | **MERGE** addyosmani's Prove-It with mattpocock's 5 ref docs into a single SB `tdd` skill |
| **Spec / PRD authoring** | `spec-driven-development`, `/spec` command | `to-prd` (non-interactive), `grill-me` (interactive pre-flight) | — | `prd.json` shape + `prd` skill | — | **COMPOSE:** Pocock's `grill-me` upstream of `to-prd` upstream of SB's PRD JSON authoring; adopt Ralph's `prd.json` shape (extended with `riskTier` etc.); addyosmani's `/spec` becomes the SB orchestrator entry-point command |
| **Story decomposition** | `planning-and-task-breakdown`, `/plan` | `to-issues` (tracer-bullet vertical slices) | — | `userStories[]` priority/passes | — | **COMPOSE:** addyosmani's `/plan` discipline + mattpocock's tracer-bullet decomposition output → Ralph's `userStories[]` shape |
| **Code review** | `code-review-and-quality` (5-axis), code-reviewer agent, `/review`, `/ship` fan-out | — | — | — | — | **ABSORB** addyosmani entirely; replace SB's `superreview` fan-out with addyosmani's pattern minus skip threshold |
| **Debugging / heal** | `debugging-and-error-recovery` | `diagnose` (HITL bash template) | — | — | — | **MERGE:** addyosmani's discipline + mattpocock's loop sequence (strip HITL `read`) into SB heal-loop |
| **CONTEXT.md / ADR discipline** | `documentation-and-adrs` | `grill-with-docs`, `improve-codebase-architecture` | — | — | — | **ABSORB** mattpocock's CONTEXT.md+ADR pattern as pre-flight; addyosmani's `documentation-and-adrs` as in-loop ADR-on-divergence |
| **Loop driver** | — | — | — | bash `ralph.sh` | (none — prose-only) | **REPLACE** with SB's TS CLI; absorb the *shape* (cap + sentinel + sleep + completion check) |
| **Sandbox / isolation** | — | — | `createSandbox`+providers (already in use) | — | None (bare-metal) | **EXTEND** SB's existing sandcastle usage; absorb unused surface (worktrees, AbortSignal, Output.object, etc.) |
| **State carryover between iters** | — | `handoff` (in-progress) | `resumeSession` | `progress.txt` agent-written | TSV results untracked | **COMPOSE:** Ralph's two-tier `progress.txt` (Codebase Patterns + per-iter entries) → JSONL with tooling-enforced append; Karpathy's TSV scalar-results log; sandcastle's `resumeSession` for self-heal retries |
| **Verification gate** | `code-review-and-quality` rubric | `tdd` red-green | — | typecheck/test (agent-trusted) | scalar `val_bpb` measurement | **REPLACE** Ralph's agent-trusted model with SB's existing programmatic gate stack; absorb addyosmani+mattpocock as discipline layers; absorb Karpathy as new `optimize` gate kind |
| **Termination** | `/ship` go/no-go | — | — | `<promise>COMPLETE</promise>` sentinel + max-iterations | infinite loop ("NEVER STOP") | **ABSORB** addyosmani's go/no-go; **ADAPT** Ralph's max-iterations; **ADAPT** Karpathy's autonomy via `--autonomous` flag with no-improvement-for-N-rounds detector |

---

## 6. Conflicts requiring explicit resolution

These are points where the 5 repos give incompatible advice. SuperBuilder must pick:

1. **Autonomy vs human-control philosophy.** Pocock explicitly opposes process-owning tools ("BMAD/Spec-Kit take away your control"). SuperBuilder is in the BMAD camp. Pocock's *artifacts* compose; Pocock's *posture* doesn't.

2. **Trust-the-agent vs gate-the-agent.** Ralph trusts the agent ran tests (`progress.txt` agent-written). Karpathy trusts the agent's edit but fences `prepare.py`. SuperBuilder gates everything programmatically. Absorbing Ralph's `progress.txt` requires tooling-enforcement, not trust.

3. **`--dangerously-skip-permissions` vs gated execution.** Both Ralph and Karpathy invoke agents with permission-skipping flags. SuperBuilder's audit log + risk-tier model is incompatible. Keep SB gates on; do not absorb the invocation pattern.

4. **Single-file vs multi-file iteration.** Karpathy iterates on one file (`train.py`). Ralph iterates on a story-graph (multi-file per story). SuperBuilder is multi-file by default. Karpathy mode = new `optimize` gate kind for perf-tuning slot, not replacement.

5. **Boolean gate vs scalar gate.** Ralph: tests pass / fail. Karpathy: `val_bpb` lower / higher. SuperBuilder gates are boolean today. Adding scalar gates (Karpathy mode) requires a new gate kind in the runner.

6. **Convergence detection.** Karpathy never converges (FOREVER loop). Ralph converges when all `passes: true`. SuperBuilder needs both: story-graph convergence (Ralph) + no-improvement-for-N-rounds for `optimize` gates (Karpathy adaptation).

7. **`/ship` skip threshold vs uniform gate.** addyosmani's `/ship` lets ≤2-files / <50-line changes bypass review. SuperBuilder's gate model gates ALL changes. Either drop the threshold or relocate behind audit-logged `--allow-trivial`.

8. **Sentinel-in-stdout vs structured output.** Ralph uses `<promise>COMPLETE</promise>` grep. Sandcastle offers `Output.object`/`Output.string`. SuperBuilder should use the structured channel; sentinel is fragile (false positives in agent narration).

---

## 7. Recommended composition manifest (build plan)

The "no other combination beats this" composition, rooted in the 5 repos:

### 7.1 Runtime substrate
- `@ai-hero/sandcastle` — pinned `~0.5.8` (patch-only)
- Extend usage to: `createWorktree`, `branchStrategy: branch`, `Output.object`, `AbortSignal`, `IterationUsage`, `mounts` (cache bind), `host.onWorktreeReady`, `promptArgs` placeholders

### 7.2 Loop architecture (Ralph + Karpathy modes)
- TS CLI (replaces `ralph.sh`) with two gate kinds:
  - **Story mode (Ralph):** `userStories[]` with `passes: bool`, fresh-agent-per-iter, completion sentinel via `Output.object` channel (not stdout grep), max-iterations cap
  - **Optimize mode (Karpathy):** scalar gate (test_pass_rate, perf bench, bundle size), keep-if-better-by-margin, git-branch-as-baseline, no-improvement-for-N-rounds detector

### 7.3 PRD shape (Ralph + extensions)
```json
{
  "project": "...",
  "branchName": "...",
  "description": "...",
  "userStories": [{
    "id": "US-001",
    "title": "...",
    "description": "...",
    "acceptanceCriteria": [...],
    "priority": 1,
    "passes": false,
    "notes": "",
    "riskTier": "low|medium|high",            // SB extension
    "verificationCommand": "...",             // SB extension
    "requiredArtifacts": [".tests/...", ...], // SB extension
    "iterationBudget": 5                      // SB extension
  }],
  "optimizationTargets": [{                   // Karpathy mode
    "id": "OPT-001",
    "targetFile": "src/hot.ts",
    "fenceFiles": ["test/fixed.ts"],
    "benchCommand": "bun run bench:hot",
    "scalarRegex": "^score: (\\d+\\.\\d+)$",
    "wallClockBudgetSec": 120,
    "keepMargin": 0.005,
    "noImprovementMaxRounds": 5
  }]
}
```

### 7.4 Skill set (composition)

| Source | Skill | Rename in SB | Phase |
|---|---|---|---|
| mattpocock | grill-me | sb-grill-me | Pre-flight |
| mattpocock | grill-with-docs | sb-grill-with-docs | Pre-flight |
| mattpocock | to-prd (non-interactive) | sb-to-prd | Pre-flight |
| mattpocock | to-issues | sb-to-issues | Pre-flight |
| addyosmani | spec-driven-development | sb-spec | Pre-flight |
| addyosmani | planning-and-task-breakdown | sb-plan | Pre-flight |
| addyosmani | source-driven-development | sb-source-grounding | Pre-flight + in-loop |
| addyosmani | context-engineering | sb-context | In-loop |
| addyosmani + mattpocock (merged) | tdd (Prove-It + 5 ref docs) | sb-tdd | In-loop / heal |
| addyosmani + mattpocock (merged) | debugging-and-error-recovery + diagnose | sb-diagnose | Heal-loop |
| addyosmani | code-review-and-quality | sb-review (5-axis) | Gate |
| addyosmani | security-and-hardening | sb-security | Gate |
| addyosmani | shipping-and-launch | sb-ship | Gate |
| addyosmani | documentation-and-adrs | sb-adr | Gate (on divergence) |
| addyosmani | code-simplification | sb-simplify | Post-heal cleanup |
| addyosmani | performance-optimization + Karpathy `program.md` | sb-optimize | Optimize gate kind |
| mattpocock | improve-codebase-architecture | sb-arch-audit | Periodic |
| mattpocock | zoom-out | sb-zoom-out | In-loop context recovery |
| mattpocock | handoff | sb-handoff | Inter-agent |
| mattpocock | caveman | sb-caveman | Token-saver |
| mattpocock | write-a-skill | sb-write-skill | Authoring |
| mattpocock | design-an-interface (deprecated, resurrect) | sb-fan-out | Orchestration primitive |

**Skipped from all 5 repos:** addyosmani's idea-refine, frontend-ui-engineering, browser-testing-with-devtools, deprecation-and-migration; mattpocock's setup-pre-commit, scaffold-exercises, migrate-to-shoehorn, edit-article, obsidian-vault, writing-* (3), qa, request-refactor-plan, ubiquitous-language; Ralph's bash driver; Karpathy's no-sandbox posture.

### 7.5 Agent set (from addyosmani, drop-in)
- `code-reviewer` — replaces SB's `reviewer`
- `security-auditor` — replaces SB's `security-auditor`
- `test-engineer` — replaces SB's `test-engineer`
- Keep SB's existing: `architect`, `planner`, `implementer`, `context-cartographer`, `product-griller`, `release-manager`, `self-improvement-researcher`, `source-update-auditor`

### 7.6 Hook set
- **Keep SB's:** block-dangerous-bash, block-secret-writes, capture-evidence (PostToolUse), verify-stop, load-superbuilder-context (SessionStart)
- **Add (from addyosmani pattern):** SessionStart-injected meta-skill (`using-superbuilder-skills`) using jq-escape pattern
- **Adapt (from mattpocock):** `git-guardrails` deny-list folded into existing `block-dangerous-bash`
- **Skip:** addyosmani's unregistered helper scripts (sdd-cache, simplify-ignore)

### 7.7 Command set (from addyosmani pattern, gate-hardened)

| Command | From | SB-modification |
|---|---|---|
| `/superbuilder:superspec` | addyosmani `/spec` | Add `tools:` allowlist; emit PRD JSON |
| `/superbuilder:superplan` | addyosmani `/plan` | Emit `userStories[]` (Ralph shape) |
| `/superbuilder:superbuild` | addyosmani `/build` | Wire to scheduler; per-story sandbox |
| `/superbuilder:supertest` | addyosmani `/test` | Wraps merged `sb-tdd` |
| `/superbuilder:superreview` | addyosmani `/ship` parallel-fan-out | **Drop** skip-threshold; route through audit log |
| `/superbuilder:superoptimize` | NEW (Karpathy mode) | Scalar-gate optimize loop on a target file |
| Keep SB's: superaudit, superheal, supersources, superstatus, supership |

### 7.8 Carryover state
- `prd.json` (Ralph shape + SB extensions)
- `progress.jsonl` (tooling-enforced append-only; Ralph two-tier + Karpathy TSV-style scalar entries)
- `archive/<branch>/` (Ralph auto-archive on branchName change)
- `.last-branch` sidecar (Ralph)

---

## 8. Open questions for grill resume

These resolve the residual ambiguities from the 5-repo composition:

**Q-A1.** Pre-flight grilling: REQUIRED before every PRD authoring, or OPTIONAL via `--strict` flag? (Pocock would say required; SB's autonomy posture suggests optional-but-recommended.)

**Q-A2.** `/ship` skip threshold: drop entirely, or relocate behind `--allow-trivial` audit-logged flag?

**Q-A3.** Carryover format: JSON sidecar (`progress.jsonl`) vs Ralph's plain `progress.txt` vs Karpathy's TSV. Pick one or hybrid?

**Q-A4.** Optimize-mode gate kind: ship in v1.0 alongside story mode, or defer to v1.1?

**Q-A5.** TDD skill merge strategy: literal merge (one `sb-tdd` skill with both Prove-It + 5 ref docs), or import both as `sb-tdd-prove-it` and `sb-tdd-discipline`?

**Q-A6.** ~~Sandcastle pinning: stay `^0.5.8` (caret, accept minor bumps) or downgrade to `~0.5.8` (patch-only) given pre-1.0 breaking-rename history?~~ **RESOLVED:** Use `~0.5.8` (patch-only). See §7.1 recommendation; SOURCE-MAP.md updated to match.

**Q-A7.** Sandcastle bus-factor: vendor-fork the lib at a known-good version under `superbuilder/sandcastle-vendored`, or trust upstream?

**Q-A8.** `using-agent-skills` SessionStart pattern: adopt the jq-escape technique, or use SB's existing `load-superbuilder-context.sh`?

**Q-A9.** Karpathy `program.md` per-target file: rename to `OPTIMIZE.md` or use the original name? (Affects discoverability vs Karpathy-pattern recognition.)

**Q-A10.** Ralph's `--dangerously-allow-all` posture: should `/superbuilder:superoptimize` ever match it for trusted optimize-mode loops, or always go through SB gates?

**Q-A11.** Cross-repo license compatibility: addyosmani MIT, mattpocock MIT, sandcastle MIT, Ralph MIT, Karpathy unclear (no LICENSE file). Treat Karpathy as unlicensed-by-default — copy *patterns*, not code, until clarified?

**Q-A12.** Composition delivery: vendor copies into SuperBuilder repo, or `npm i` / `git submodule` against upstream? (Tradeoff: drift risk vs maintenance cost.)

---

*End of analysis. Doc is research-only; no implementation commitments. Resume grill with §8 questions in hand.*
