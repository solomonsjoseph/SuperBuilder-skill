# Superbuilder — NIST AI Risk Management Framework Profile

**Frameworks:** NIST AI RMF 1.0 (January 26, 2023) + NIST AI 600-1 GenAI Profile (July 26, 2024)
**Version:** 1.0-draft | **Date:** 2026-05-08

This document maps SuperBuilder's design and evidence artifacts to the four NIST AI RMF core functions and to the GenAI-specific risks enumerated in NIST AI 600-1 §2. Federal reviewers and 3PAO assessors should read this alongside `docs/THREAT-MODEL.md` and `docs/SECURE-BY-DESIGN-ATTESTATION.md`.

---

## Part 1: NIST AI RMF 1.0 — Four Core Functions

### GOVERN

GOVERN establishes organizational accountability, policies, and risk tolerance for AI system deployment.

| Subcategory | SuperBuilder Implementation | Evidence Artifact |
|---|---|---|
| 1.1 — Legal/regulatory understanding | `humanApprovalRequiredFor` list enforces compliance boundaries for production deploy, destructive commands, auth changes, billing changes, security policy changes | `prd.json` field |
| 1.2 — Trustworthy AI in policies | Policy integrity hash + Stop-hook block any run that lacks human approval for controlled actions; deterministic deny list enforces safe defaults | `security.ts:policyHash()` + `hooks/verify-stop.sh` |
| 1.3 — Risk tolerance assessment | `riskLevel` per story (low/medium/high) + `qualityGates` as binding risk controls selectable per project | `prd.json` fields |
| 1.4 — Transparent risk processes | All gate decisions logged with `gate-audit:` prefix; policy hash mismatch written to disk; all approval decisions recorded as timestamped artifacts | Gate `.log` files + `.superbuilder/last-run-policy-mismatch.json` + `.superbuilder/approvals/` |

**Gap:** No formal organizational AI governance policy document beyond this profile. This document itself provides the "AI in policies" evidence required by GOVERN.

### MAP

MAP establishes context to identify and frame AI-related risks across the AI lifecycle.

| Activity | SuperBuilder Implementation |
|---|---|
| AI lifecycle actors | Five-phase flow in `docs/AFK-AUTO-MODE-DESIGN.md`; all actors identified: user, orchestrator, sandcastle runtime, subagents, MCP servers |
| Risk identification | OWASP Agentic AI Top 10 (ASI01–ASI10, accessed May 2026) alignment in `docs/SECURITY.md`; MITRE ATLAS v5.6.0 (May 4, 2026) technique table in `docs/SECURITY.md`; CISA "Careful Adoption of Agentic AI Services" (May 2026, joint CISA + Five Eyes) reviewed against SuperBuilder's MCP guard and trust model |
| Interdependency assessment | Source drift detection (`orchestrator/src/source-audit.ts`) classifies upstream diffs; policy hash catches mid-run mutations by sandboxed subagents |
| Negative impact anticipation | STRIDE analysis in `docs/THREAT-MODEL.md` anticipates attacker goals and attack vectors for all seven identified assets |

### MEASURE

MEASURE analyzes, tracks, and quantifies AI risks with metrics and testing.

| Activity | SuperBuilder Implementation | Evidence Artifact |
|---|---|---|
| Pre-deployment testing | 153+ automated tests covering gates, security controls, validate logic, approvals | `orchestrator/` test suite; CI on every PR |
| Security gate automation | FORBIDDEN_TOKENS regex + ALLOWED_PROGRAMS allow-list + HIGH_RISK_PROGRAMS opt-in evaluated before every gate command spawn | `allow-list.ts`, `gates.ts` |
| Independent review chain | 4-way parallel review (code-reviewer, security-auditor, test-engineer, architect-validator) per story | `.superbuilder/review-reports/` (v0.4+) |
| Trustworthiness metrics | Policy hash verified before each story iteration; gate pass/fail rate tracked per story in `prd.json` | `security.ts`, `prd.json` story `passes`/`attempts` fields |

**Gap (v1.0):** No formal reliability metrics per story type; no benchmark pass-rate targets. Token/cost ceiling not yet enforced. Coverage metrics not gated in CI.

### MANAGE

MANAGE allocates resources to treat identified risks and documents residual risks.

| Activity | SuperBuilder Implementation | Evidence Artifact |
|---|---|---|
| Risk prioritization | Kill switch (v0.3) halts on anomaly; per-story `maxAttempts` bounds runaway loops | `.superbuilder/kill.flag` + story `attempts` counter |
| Risk treatment records | Approval records per controlled action; policy mismatch artifact on tamper detection | `.superbuilder/approvals/`, `.superbuilder/last-run-policy-mismatch.json` |
| Residual risk disclosure | `docs/SECURITY.md` "What we explicitly do NOT promise" + this document's accepted-risk declarations | Published documentation |
| Incident response | Forbidden token / secret write detection triggers deterministic denial + hook decision log | `block-dangerous-bash.sh` / `block-secret-writes.sh` denial logs |

---

## Part 2: NIST AI 600-1 — GenAI-Specific Risk Profile

NIST AI 600-1 (July 26, 2024) enumerates GenAI-specific risks in §2. See the [primary document](https://nvlpubs.nist.gov/nistpubs/ai/nist.ai.600-1.pdf) §2 for canonical risk names and definitions — secondary-source paraphrases vary. This table maps each risk to SuperBuilder's mitigation posture for the code generation context.

| Risk Category | Relevance to SuperBuilder | Mitigation / Accepted Risk |
|---|---|---|
| **Confabulation / Hallucination** | Generated code references non-existent APIs, packages, or function signatures — creates silent security failures | Security-auditor agent (v0.4) explicitly checks generated imports and API calls for verifiability; KEV catalog check flags hallucinated or vulnerable packages (see `docs/SECURITY.md`) |
| **Harmful Bias / Discrimination** | Generated code may embed discriminatory logic | Security-auditor agent checks for bias patterns (v0.4 DoD AI Principles alignment); accepted residual risk until automated bias detection matures |
| **Data Privacy** | Agent context window contains source code that may include PII | `block-secret-writes.sh` blocks `.env`/key writes; MCP guard prevents exfiltration via MCP (v0.2); accepted residual risk for incidental PII in source |
| **Information Security** | Adversarial prompts injected via MCP or research dossier direct agent to generate insecure code | MCP content scan (v0.2); security-auditor OWASP ASVS L2 check on generated code; FORBIDDEN_TOKENS blocks injection in gate commands |
| **Information Integrity** | Generated code reflects outdated practices | Latest-practices research dossier fetched before Phase 1 lock; source drift detection on upstream repos; context7 MCP for current library docs |
| **Intellectual Property** | Generated code may infringe copyrighted training data | Accepted residual risk; outside SuperBuilder's control at the model layer |
| **Value Chain / Component Integration** | Upstream ralph/sandcastle compromise could alter execution environment | Source drift detection (`source-audit.ts`) classifies upstream changes as security/breaking/capability; SBOM (v1.0) cross-references plugin dependencies |
| **CBRN Uplift** | Not applicable — SuperBuilder is a code generation tool for software development | Accepted: out of scope |
| **Dangerous / Violent / Hateful Content** | Not applicable — primary output is software code | Accepted: out of scope |
| **Environmental Impact** | API usage has carbon footprint | Accepted residual risk; outside scope of this plugin |
| **Obscured System Prompt / Transparency** | SKILL.md files and agent prompts readable by subagents if not compartmentalized | Context compartmentalization (v1.2) addresses this; accepted residual risk in v0.x–v1.1 |
| **Undue Concentration / Homogenization** | Dependency on single AI provider (Anthropic) | Accepted: architectural constraint outside plugin's control |

---

## Part 3: OMB M-24-10 Vendor Documentation Requirements

OMB M-24-10 (March 28, 2024, mandatory for federal agencies) requires vendors supporting AI deployments to provide:

| Requirement | SuperBuilder Response |
|---|---|
| Capabilities documentation | `docs/ARCHITECTURE.md` — component responsibilities, data flows, quality gates, approval gates, branch policy |
| Limitations documentation | `docs/LIMITATIONS.md` — not-yet-wired items, out-of-scope, known sharp edges; `docs/SECURITY.md` "What we explicitly do NOT promise" |
| Risk assessment support | `docs/THREAT-MODEL.md` (STRIDE) + this document (AI RMF) + `docs/SECURE-BY-DESIGN-ATTESTATION.md` (CISA) + `docs/NIST-IR-8397-VERIFICATION.md` (EO 14028) |
| Model transparency | SuperBuilder uses Anthropic Claude (claude-opus-4-7 default); model version is runtime-configurable; SuperBuilder generates code but does not train or fine-tune models |

---

## Part 4: ISO/IEC 42001:2023 Alignment (Five Eyes Optional Appendix)

For UK NCSC or ASD Australia (Five Eyes) procurement, reviewers may check ISO 42001 AI Management System alignment. This mapping satisfies Five Eyes reviewer expectations without requiring third-party certification.

| ISO 42001 Annex A | SuperBuilder Mechanism |
|---|---|
| A.2 — Policies for AI development | `humanApprovalRequiredFor` list in `prd.json` + this AI RMF profile document |
| A.3 — Internal/external AI roles | `docs/ARCHITECTURE.md` component responsibilities table |
| A.4 — Resources for AI system | sandcastle runtime substrate; gate runner with ALLOWED_PROGRAMS; 153+ test suite |
| A.5 — Assessing AI system impacts | STRIDE threat model in `docs/THREAT-MODEL.md` + OWASP ASI01–ASI10 alignment |
| A.6 — AI system lifecycle | 12-skill SDLC pipeline in `docs/ARCHITECTURE.md`; five-phase AFK flow in `docs/AFK-AUTO-MODE-DESIGN.md` |
| A.8 — Incident management | CVD policy in `docs/SECURITY.md`; hook denial logs as incident artifacts; `.superbuilder/last-run-policy-mismatch.json` |

**Additional Five Eyes guidance:** CISA "Careful Adoption of Agentic AI Services" (May 2026, co-published with UK NCSC, ASD ACSC, CCCS, NCSC-NZ) provides joint agentic-AI-specific procurement guidance. Key recommendations addressed by SuperBuilder: MCP server trust boundaries (`mcp-guard.ts` v0.2), memory integrity (`memory-guard.ts` v0.2), and human-in-the-loop gates at Phase 0 and Phase 4 of the AFK flow.

Note: ISO 42001 third-party certification is not required for US federal engagements. This mapping addresses Five Eyes joint program expectations only.
