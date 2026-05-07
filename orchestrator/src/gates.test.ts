import { describe, it, expect } from "vitest";
import { mkdtemp, readFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { relevantGates, runGate } from "./gates.js";
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

  it("missing binary => failed (today; errored is desired-future)", async () => {
    const dir = await mkdtemp(join(tmpdir(), "gates-"));
    // not in allow-list, so refused at allow-list check => failed
    const result = await runGate("test", "this-binary-does-not-exist-12345", dir);
    expect(result.status).toBe("failed");
  });

  it("'node --version' is in allow-list and passes", async () => {
    const dir = await mkdtemp(join(tmpdir(), "gates-"));
    const result = await runGate("test", "node --version", dir);
    expect(result.status).toBe("passed");
    expect(result.exitCode).toBe(0);
  });

  it("'rm -rf /' => failed; log mentions shell metacharacters or allow-list", async () => {
    const dir = await mkdtemp(join(tmpdir(), "gates-"));
    const result = await runGate("test", "rm -rf /", dir);
    expect(result.status).toBe("failed");
    const log = await readFile(result.evidencePath, "utf8");
    expect(/shell metacharacters|allow-list/.test(log)).toBe(true);
  });

  it("unknown program => failed; log mentions allow-list", async () => {
    const dir = await mkdtemp(join(tmpdir(), "gates-"));
    const result = await runGate("test", "totallyunknownbinary --foo", dir);
    expect(result.status).toBe("failed");
    const log = await readFile(result.evidencePath, "utf8");
    expect(/allow-list/.test(log)).toBe(true);
  });
});
