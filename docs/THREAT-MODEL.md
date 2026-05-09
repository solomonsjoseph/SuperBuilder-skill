# Superbuilder — Formal Threat Model

**Standard:** STRIDE analysis per ICD 503, NIST SP 800-37, and FedRAMP authorization requirements.
**Version:** 1.0-draft | **Date:** 2026-05-08

## Assets Under Protection

| # | Asset | Location | Sensitivity |
|---|---|---|---|
| 1 | Policy authority document | `.superbuilder/prd.json` | HIGH — controls deploymentAllowed, gates, sourceRefs |
| 2 | Human authorization records | `.superbuilder/approvals/` | HIGH — proof of human consent |
| 3 | Story execution state | `.superbuilder/progress.jsonl` | MEDIUM — audit trail |
| 4 | Hook configuration | `hooks/hooks.json` | HIGH — defines security lifecycle |
| 5 | Source code under development | Working tree / story branch | HIGH — primary deliverable |
| 6 | Agent context window | In-process | CRITICAL — policy + secrets visible |
| 7 | MCP connection endpoints | External | HIGH — trust boundary |
| 8 | Build / CI pipeline | `.github/workflows/` | HIGH — supply chain integrity |

## Threat Actors

- **State-sponsored adversary (APT):** High sophistication, persistent. GTG-1002 (September 2025) used Claude Code autonomously at scale against 30 defense/energy organizations — the exact execution model SuperBuilder uses.
- **Supply chain attacker:** Targets upstream packages (ralph, sandcastle, plugin dependencies) or the CI/CD build pipeline itself.
- **Prompt-injected subagent:** Sandboxed subagent directed by malicious prompt to escalate privileges, exfiltrate data, or weaken policy.
- **Malicious MCP response:** Attacker-controlled web content returned by context7 or AWS MCP containing prompt injection.
- **Compromised developer workstation:** An adversary with write access to `.claude/MEMORY.md` can poison every future session.

## STRIDE Analysis

| Threat | Asset | Attack Vector | Current Mitigation | Residual Gap | Fix Version |
|---|---|---|---|---|---|
| **Spoofing** — fake human approval | `.superbuilder/approvals/` | Subagent writes approval file without user action | Stop-hook completeness check | No cryptographic proof of human identity | v1.0 delegation chain |
| **Tampering** — PRD policy mutation | `prd.json` | Sandboxed subagent writes policy fields mid-run | SHA-256 policy hash re-checked before each story | SHA-256 below CNSA 2.0 SHA-384 minimum; no ML-DSA signature | v1.1 SHA-384 + FIPS 204 |
| **Tampering** — hook removal | `hooks/hooks.json` | Code injection adds `disabled`/`noVerify` marker | `block-secret-writes.sh` rejects these patterns | Pattern match only; not cryptographically signed | v1.1 artifact signing |
| **Tampering** — build pipeline | Release artifacts | Compromised CI config injects backdoor | GitHub Actions ephemeral runners | No SLSA provenance; no VEX documents | v1.0 SLSA Level 3 + VEX |
| **Repudiation** — deny action occurred | `progress.jsonl` | Log deletion or modification | Append-only JSONL | Not hash-chained; deletable | v1.1 FIPS 204 chain |
| **Info Disclosure** — context leak | Agent context window | Memory poisoning via MEMORY.md write | None | No HMAC validation of MEMORY.md | v0.2 `memory-guard.ts` |
| **Info Disclosure** — MCP exfiltration | PRD + secrets | Malicious MCP response exfiltrates context | None | MCP output not content-scanned | v0.2 `mcp-guard.ts` |
| **Info Disclosure** — side-channel | Encrypted API traffic | Token-timing inference (Whisper Leak, arxiv:2511.03675) | None | No complete defense; accepted residual risk | N/A — accepted |
| **Denial of Service** — execution loop | Sandcastle runner | Story fails repeatedly, burns API budget | `maxAttempts` per story | No token/cost ceiling | v1.0 |
| **Elevation of Privilege** — shell escape | Host filesystem | Gate command with shell metacharacter | FORBIDDEN_TOKENS regex + ALLOWED_PROGRAMS allow-list | Audit log tracks what ran; regex coverage verified | Working |
| **Elevation of Privilege** — HIGH_RISK gate bypass | Gate runner | Run `npx`/`node`/`deno`/`make`/`cargo` without explicit opt-in | HIGH_RISK_PROGRAMS check in `gates.ts`; requires `"exec gate command"` in PRD | Working | — |
| **Elevation of Privilege** — sandbox escape | Host OS | Sandcastle misconfiguration allows host filesystem write | Sandbox required for autonomous mode | Sandcastle API broken (v0.5.10 change) | Immediate fix |

## Build Pipeline as Attack Surface

Per NSA/CISA/ODNI "Securing the Software Supply Chain: Recommended Practices for Developers" (September 2022), the CI/CD pipeline itself is an asset requiring threat modeling.

| Threat | Attack Vector | Current Mitigation | Planned Fix |
|---|---|---|---|
| Compromised build environment | Malicious CI config change injects backdoor into release artifacts | GitHub Actions ephemeral runners (fresh per build) | SLSA Level 3 provenance attestation (v1.0) |
| Dependency confusion | Malicious package with matching internal name published to public registry | `package-lock.json` integrity checked on install | SBOM cross-referenced vs CISA KEV catalog (v1.0) |
| Poisoned release artifact | Post-build artifact modification before user download | None | SLSA provenance attests build inputs + artifact hash (v1.0) |
| Unsigned commits | Malicious commit bypasses CI signatures | None | Enforce GPG/Sigstore signed commits + document in `docs/SECURITY.md` (v1.0) |

## MITRE ATLAS v5.6.0 Cross-Reference

See `docs/SECURITY.md` "MITRE ATLAS v5.6.0 Threat Coverage" for the full technique-to-defense mapping covering T0040, T0041, T0043, T0044, T0035, T0029, T0031, and T0038.

## Real-World Incidents

These are not theoretical. The attack surface is live:

- **GTG-1002 (September 2025):** Chinese state-sponsored actors used Claude Code autonomously at 1000s requests/second against 30 defense/energy organizations — exactly the plugin execution model SuperBuilder uses.
- **Mexico breach (December 2025–February 2026):** 195 million taxpayer records breached via Claude Code agents with file-write access.
- **CVE-2026-35435 (May 7, 2026, CVSS 9.x+):** Azure AI Foundry privilege escalation, active exploitation, no patch. SuperBuilder does not use Azure AI Foundry; documented as external dependency risk for users integrating SuperBuilder with Azure.

## Mitigation Roadmap

| Version | Threats Addressed |
|---|---|
| **Immediate** | Sandcastle API fix (`iterationsRun` → `iterations[]`) restores sandbox boundary |
| **v0.2** | Memory poisoning (Info Disclosure) via `memory-guard.ts`; MCP exfiltration (Info Disclosure) via `mcp-guard.ts` |
| **v0.3** | DoS kill switch (`.superbuilder/kill.flag` check before each iteration) |
| **v1.0** | Delegation chain (Spoofing on approvals); SBOM + SLSA Level 3 + VEX (Supply Chain Tampering); token/cost ceiling (DoS); CVD policy |
| **v1.1** | FIPS 204 ML-DSA audit chain (Repudiation); SHA-384 upgrade (Tampering — CNSA 2.0 minimum) |
| **v2.1** | SHA-3-256 + ML-DSA-87 full CNSA 2.0 + FIPS 203/204/205 (future-proofs Tampering + Info Disclosure) |

## Known Residual Risks

See `docs/SECURITY.md` "What we explicitly do NOT promise" for the complete list, including:
- Whisper Leak side-channel timing (arxiv:2511.03675) — accepted
- Anthropic API trust boundary — accepted; outside threat model
- Authenticated-user manual terminal commands — accepted; hooks only intercept agent tool calls
- Classified processing — not supported until v2.0 NSA CSfC dual-layer encryption
