# Superbuilder — CISA Secure by Design Attestation

**Primary Guidance:** "Shifting the Balance of Cybersecurity Risk: Principles and Approaches for Secure by Design Software"
**Published:** October 25, 2023
**Co-signed by:** CISA + 17 US and allied agencies (NSA, FBI, UK NCSC, ASD ACSC Australia, CCCS Canada, NCSC-NZ)
**Source:** cisa.gov/resources-tools/resources/secure-by-design
**CISA statement:** "Software Must Be Secure by Design, and Artificial Intelligence is No Exception."

**Supplementary Guidance (Agentic AI):** CISA "Careful Adoption of Agentic AI Services" (May 2026)
**Co-published by:** CISA + UK NCSC + ASD ACSC + CCCS + NCSC-NZ (same Five Eyes coalition)
**Source:** cisa.gov/resources-tools/resources/careful-adoption-agentic-ai-services
**Applicability:** Directly governs agentic AI tools with autonomous code execution — the exact execution model SuperBuilder uses.

This document maps each of the three Secure by Design principles to SuperBuilder's specific enforcement mechanisms. It is the attestation artifact required for any US government or Five Eyes engagement where this joint guidance applies. The May 2026 supplementary guidance on agentic AI is addressed in the mechanism rows below and in `docs/AI-RMF-PROFILE.md` Part 4.

---

## Principle 1: Take Ownership of Customer Security Outcomes

> The software manufacturer — not the customer — bears responsibility for the security of the software. Security must be the default posture, not an add-on.

**SuperBuilder's implementation:**

Security is architecturally enforced before any agent action executes. Users cannot accidentally disable these controls through normal plugin use:

| Mechanism | File | What It Enforces |
|---|---|---|
| Deterministic deny list | `hooks/scripts/block-dangerous-bash.sh` | Pre-execution hard rejection of 40+ destructive patterns: force push, publish commands, `rm -rf`, DB destruction, `.env` reads — runs before every Bash tool call |
| Secret write protection | `hooks/scripts/block-secret-writes.sh` | Blocks writes to `.env`/`*.pem`/`*.key`/`id_rsa`; detects AWS/OpenAI/GitHub/Slack token shapes; rejects edits that add `disabled`/`noVerify` to hooks config |
| Gate runner command isolation | `orchestrator/src/allow-list.ts` | Gate commands parsed as argv (not `bash -c`); only programs in ALLOWED_PROGRAMS can run; FORBIDDEN_TOKENS regex blocks all shell metacharacters |
| High-risk program opt-in | `orchestrator/src/gates.ts` HIGH_RISK_PROGRAMS | `npx`, `node`, `deno`, `make`, `cargo` require explicit `"exec gate command"` entry in PRD — insecure code execution cannot happen accidentally |
| Deployment impossibility | `prd.json` `deploymentAllowed: false` | Production deploy is structurally impossible without: PRD field change + human approval + signed approval file + literal `approve-deploy` CLI argument — four independent gates |
| Policy integrity hash | `orchestrator/src/security.ts` | SHA-256 of four trust-model fields computed before every story; mid-run mutation by sandboxed subagent is detected and aborts the run |
| Stop-hook completeness check | `hooks/scripts/verify-stop.sh` | Blocks "task done!" claims that lack evidence files on disk; a story without `diff.patch` cannot complete regardless of agent claims |

**Acknowledged gaps (planned):**
- Memory poisoning defense (`memory-guard.ts`, v0.2) — MEMORY.md contents not yet HMAC-validated
- MCP output sandboxing (`mcp-guard.ts`, v0.2) — MCP responses not yet content-scanned before entering agent context

Until v0.2 ships, customers integrating MCP servers or using MEMORY.md should treat these as unmitigated risks.

---

## Principle 2: Embrace Radical Transparency and Accountability

> Make security posture visible. Publish known limitations. Audit every security-relevant decision.

**SuperBuilder's implementation:**

| Evidence Artifact | What It Makes Transparent |
|---|---|
| `docs/SECURITY.md` | Full security model: threat model, block lists, sandbox requirement, policy integrity, gate runner trust model, MITRE ATLAS table, audit log format, KEV awareness, CVD policy, and explicit known limitations — all public |
| `docs/THREAT-MODEL.md` | Formal STRIDE analysis with current defense AND residual gap for every identified threat, including real-world incident precedents |
| `docs/LIMITATIONS.md` | Honest declaration of incomplete features, not-yet-wired items, known sharp edges, and the criteria for "done" |
| `docs/NIST-IR-8397-VERIFICATION.md` | All 11 EO 14028 verification standards mapped with gap status and fix version |
| Gate audit log headers | `gate-audit: <program> <args>` and `gate-command: <full string>` written to every gate's `.log` before execution — reviewers see exactly what ran |
| `.superbuilder/last-run-policy-mismatch.json` | Written with `{snapshot, current, fields-that-differ}` when policy mutation is detected — tamper evidence on disk |
| `.superbuilder/approvals/` | Every human authorization recorded as a timestamped artifact — the approval trail is on disk, not only in conversation |
| SBOM + SLSA provenance (v1.0) | Machine-readable supply chain evidence per release enabling agency dependency audits |
| VEX documents (v1.0) | Vulnerability Exploitability eXchange files alongside SBOM to distinguish exploitable vs. non-exploitable CVEs |

---

## Principle 3: Lead From the Top

> Security must be a mandatory gate enforced at the architecture level, not a style preference or documentation recommendation.

**SuperBuilder's implementation:**

Security controls are architectural. They fire at the Claude Code lifecycle level, before and after tool execution, and cannot be bypassed by the agent choosing different phrasing or different tool calls:

| Control | Architectural Enforcement Mechanism |
|---|---|
| Hook registration in `hooks/hooks.json` | Hooks fire at PreToolUse, PostToolUse, and Stop lifecycle events — the agent cannot select which hooks fire; Claude Code runs them |
| `deploymentAllowed: false` schema default | Schema-level; `validate.ts` rejects any PRD where this is `true` at plan time; four independent conditions required to flip it at run time |
| `humanApprovalRequiredFor` list | 10 categories of high-impact actions enforced by the orchestrator — not advisory prompts; the scheduler will not proceed without a corresponding approval artifact |
| FORBIDDEN_TOKENS regex refusal | Structural: gate commands are rejected before any subprocess is spawned; the agent cannot construct a pipeline command even if it tries |
| Stop-hook completeness check | Architectural gate at the conversation end; a story that lacks evidence cannot be marked complete regardless of what the agent claims in text |
| Policy hash abort | The orchestrator aborts the entire run (not just one story) when a policy field mutation is detected — no partial completion possible after tampering |

---

## Formal Attestation Statement

SuperBuilder v0.1 takes ownership of customer security outcomes through deterministic, architecture-level enforcement of a deny list, allow list, approval gate model, and policy integrity hash. Security posture is fully transparent through published documentation (threat model, STRIDE analysis, limitations, known-limitation disclosures, gate audit logs). Security is enforced at the architecture level through hook lifecycle events, the orchestrator scheduler, and the Stop hook — it cannot be accidentally disabled through normal plugin use.

**Gaps acknowledged at v0.1 (planned for v0.2):**
- Memory integrity: MEMORY.md HMAC validation not yet implemented
- MCP output sandboxing: MCP responses not yet content-scanned

These gaps are explicitly disclosed per CISA Secure by Design Principle 2 (radical transparency). Both are tracked with specific implementation plans in `docs/SECURITY.md`.

This attestation satisfies the documentation requirement of the CISA + 17-agency "Shifting the Balance of Cybersecurity Risk: Principles and Approaches for Secure by Design Software" (October 25, 2023) for software tools targeting US government or allied nation procurement.
