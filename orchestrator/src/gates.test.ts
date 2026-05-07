import { describe, it, expect } from "vitest";
import { mkdtemp, readFile, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { relevantGates, runGate, HIGH_RISK_PROGRAMS } from "./gates.js";
import type { UserStory } from "./types.js";

function makeStory(overrides: Partial<UserStory> = {}): UserStory {
  return {
    id: "US-001",
    title: "t",
    description: "d",
    acceptanceCriteria: ["a"],
    priority: 1,
    riskLevel: "low",
    filesLikelyTouched: [],
    dependencies: [],
    passes: false,
    attempts: 0,
    lastFailure: null,
    evidence: {
      tests: [], security: [], review: [], browser: [], accessibility: [], performance: [],
      commits: [], diffs: [],
    },
    ...overrides,
  };
}

describe("relevantGates", () => {
  it("returns the low set", () => {
    const gates = relevantGates(makeStory({ riskLevel: "low" }));
    expect(gates).toContain("test");
    expect(gates).toContain("typecheck");
    expect(gates).not.toContain("performance");
    expect(gates).not.toContain("integrationTest");
  });
  it("returns the medium set (includes integrationTest, dependencyAudit)", () => {
    const gates = relevantGates(makeStory({ riskLevel: "medium" }));
    expect(gates).toContain("integrationTest");
    expect(gates).toContain("dependencyAudit");
    expect(gates).not.toContain("performance");
    expect(gates).not.toContain("browser");
  });
  it("returns the high set (includes browser, performance, accessibility)", () => {
    const gates = relevantGates(makeStory({ riskLevel: "high" }));
    expect(gates).toContain("browser");
    expect(gates).toContain("performance");
    expect(gates).toContain("accessibility");
    expect(gates).toContain("security");
  });
});

describe("runGate", () => {
  it("null command => skipped + writes a .skipped.md file", async () => {
    const dir = await mkdtemp(join(tmpdir(), "gates-"));
    const result = await runGate("test", null, dir);
    expect(result.status).toBe("skipped");
    const skipPath = join(dir, "test.skipped.md");
    const st = await stat(skipPath);
    expect(st.isFile()).toBe(true);
  });

  it("'node --version' is in allow-list and passes (allowedHighRisk=true)", async () => {
    const dir = await mkdtemp(join(tmpdir(), "gates-"));
    const result = await runGate("test", "node --version", dir, { allowedHighRisk: true });
    expect(result.status).toBe("passed");
    expect(result.exitCode).toBe(0);
  });

  it("allow-list refusal => errored (unknown program)", async () => {
    const dir = await mkdtemp(join(tmpdir(), "gates-"));
    const result = await runGate("test", "totallyunknownbinary --foo", dir);
    expect(result.status).toBe("errored");
    expect(result.reason).toMatch(/allow-list/);
    const log = await readFile(result.evidencePath, "utf8");
    expect(/allow-list/.test(log)).toBe(true);
  });

  it("shell-meta refusal => errored ('rm -rf /' contains meta)", async () => {
    const dir = await mkdtemp(join(tmpdir(), "gates-"));
    const result = await runGate("test", "rm -rf /", dir);
    expect(result.status).toBe("errored");
    expect(result.reason).toMatch(/shell metacharacters|allow-list/);
    const log = await readFile(result.evidencePath, "utf8");
    expect(/shell metacharacters|allow-list/.test(log)).toBe(true);
  });

  it("missing binary that is in the allow-list path resolution still surfaces as errored", async () => {
    // Note: 'this-binary-does-not-exist-12345' is itself not in the allow-list,
    // so this is an allow-list refusal — kept for parity with the old test
    // which conflated the two but expected 'failed'.
    const dir = await mkdtemp(join(tmpdir(), "gates-"));
    const result = await runGate("test", "this-binary-does-not-exist-12345", dir);
    expect(result.status).toBe("errored");
  });

  it("real test failure => failed (node script that exits 1)", async () => {
    const dir = await mkdtemp(join(tmpdir(), "gates-"));
    // Use a real .js file because `node -e "process.exit(1)"` would be
    // refused at the shell-meta check (parens are forbidden tokens).
    const scriptPath = join(dir, "exit1.js");
    await writeFile(scriptPath, "process.exit(1);\n");
    const result = await runGate("test", `node ${scriptPath}`, dir, { allowedHighRisk: true });
    expect(result.status).toBe("failed");
    expect(result.exitCode).toBe(1);
    expect(result.reason).toBeNull();
  });

  it("per-gate timeout => errored", async () => {
    const dir = await mkdtemp(join(tmpdir(), "gates-"));
    // node script that sleeps forever (no parens, allowed program).
    const scriptPath = join(dir, "forever.js");
    await writeFile(scriptPath, "setInterval(function(){}, 1000);\n");
    const result = await runGate("test", `node ${scriptPath}`, dir, { timeoutMs: 200, allowedHighRisk: true });
    expect(result.status).toBe("errored");
    expect(result.reason).toMatch(/timed out/);
  });

  // --- HIGH_RISK_PROGRAMS tests ---

  it("HIGH_RISK_PROGRAMS contains all expected entries", () => {
    const expected = ["npx", "pnpx", "bunx", "dlx", "node", "bun", "tsx", "make", "cargo", "deno"];
    for (const p of expected) {
      expect(HIGH_RISK_PROGRAMS.has(p), `expected HIGH_RISK_PROGRAMS to contain '${p}'`).toBe(true);
    }
  });

  it("high-risk program (node) without allowedHighRisk => errored with reason", async () => {
    const dir = await mkdtemp(join(tmpdir(), "gates-"));
    const result = await runGate("test", "node --version", dir);
    expect(result.status).toBe("errored");
    expect(result.reason).toMatch(/high-risk/);
    expect(result.reason).toMatch(/humanApprovalRequiredFor/);
    const log = await readFile(result.evidencePath, "utf8");
    expect(log).toMatch(/high-risk/);
  });

  it("high-risk program (node) with allowedHighRisk=true => proceeds normally", async () => {
    const dir = await mkdtemp(join(tmpdir(), "gates-"));
    const result = await runGate("test", "node --version", dir, { allowedHighRisk: true });
    expect(result.status).toBe("passed");
    expect(result.exitCode).toBe(0);
  });

  it("audit lines appear in evidence log for a non-high-risk gate run", async () => {
    const dir = await mkdtemp(join(tmpdir(), "gates-"));
    // 'npm' is in the allow-list and not in HIGH_RISK_PROGRAMS.
    const result = await runGate("test", "npm --version", dir);
    expect(result.status).toBe("passed");
    const log = await readFile(result.evidencePath, "utf8");
    expect(log).toMatch(/^gate-audit: npm --version/m);
    expect(log).toMatch(/^gate-command: npm --version/m);
  });

  it("audit lines appear in evidence log for a high-risk gate run with allowedHighRisk=true", async () => {
    const dir = await mkdtemp(join(tmpdir(), "gates-"));
    const result = await runGate("test", "node --version", dir, { allowedHighRisk: true });
    expect(result.status).toBe("passed");
    const log = await readFile(result.evidencePath, "utf8");
    expect(log).toMatch(/^gate-audit: node --version/m);
    expect(log).toMatch(/^gate-command: node --version/m);
  });
});
