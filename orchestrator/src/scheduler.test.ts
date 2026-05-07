import { describe, it, expect, vi } from "vitest";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { run } from "./scheduler.js";
import * as prdModule from "./prd.js";
import { loadPRD } from "./prd.js";
import type { PRD, UserStory } from "./types.js";

function makeStory(overrides: Partial<UserStory> = {}): UserStory {
  return {
    id: "US-001",
    title: "first",
    description: "first story",
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

function makePRD(overrides: Partial<PRD> = {}): PRD {
  return {
    schemaVersion: "superbuilder.prd.v2",
    project: "p",
    branchName: "superbuilder/run",
    targetBranch: "feature",
    integrationBranch: "superbuilder/integration",
    description: "d",
    riskLevel: "low",
    deploymentAllowed: false,
    sourceRefs: {
      "addyosmani/agent-skills": "a",
      "mattpocock/skills": "b",
      "mattpocock/sandcastle": "c",
      "snarktank/ralph": "d",
      "karpathy/autoresearch": "e",
    },
    humanApprovalRequiredFor: [
      "production deploy",
      "destructive commands",
      "secrets changes",
      "billing changes",
      "auth changes",
      "database destructive migrations",
      "dependency additions",
      "security policy changes",
      "quality gate weakening",
    ],
    qualityGates: {
      typecheck: null,
      lint: null,
      format: null,
      test: null,
      integrationTest: null,
      security: null,
      secretScan: null,
      dependencyAudit: null,
      licenseCheck: null,
      browser: null,
      accessibility: null,
      performance: null,
    },
    userStories: [
      makeStory({ id: "US-001", title: "first", priority: 1 }),
      makeStory({
        id: "US-002",
        title: "second",
        priority: 2,
        evidence: {
          tests: [], security: [], review: [], browser: [], accessibility: [], performance: [],
          commits: [], diffs: [],
        },
      }),
    ],
    ...overrides,
  };
}

async function setupDryRunRoot(prd: PRD): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "sb-sched-"));
  await writeFile(join(root, "prd.json"), JSON.stringify(prd, null, 2) + "\n");
  // Pre-seed evidence so each story satisfies evidenceComplete in dryRun
  // (no sandbox runs; gates all skipped because qualityGates are null).
  for (const story of prd.userStories) {
    const evDir = join(root, "evidence", story.id);
    await mkdir(evDir, { recursive: true });
    await writeFile(join(evDir, "diff.patch"), "fake diff for test\n");
  }
  return root;
}

describe("scheduler policy integrity", () => {
  it("aborts when prd.json policy fields are mutated mid-run", async () => {
    const prd = makePRD();
    const root = await setupDryRunRoot(prd);
    const store = await loadPRD(root);

    // The scheduler calls loadPRD on every iteration (start of each pick).
    // First call (iteration 1): pass through.
    // Second call (iteration 2): mutate prd.json on disk to flip
    // deploymentAllowed=true *before* loadPRD reads it. The fresh load
    // then surfaces a different policyHash and the scheduler must abort.
    let calls = 0;
    const spy = vi.spyOn(prdModule, "loadPRD").mockImplementation(async (rootArg: string) => {
      calls++;
      if (calls === 2) {
        const raw = await readFile(join(rootArg, "prd.json"), "utf8");
        const parsed = JSON.parse(raw) as PRD;
        parsed.deploymentAllowed = true;
        await writeFile(join(rootArg, "prd.json"), JSON.stringify(parsed, null, 2) + "\n");
      }
      // Use the actual implementation indirectly by importing what loadPRD
      // delegates to. Easiest: re-implement here using the public surface.
      const raw = await readFile(join(rootArg, "prd.json"), "utf8");
      const parsedPrd = JSON.parse(raw) as PRD;
      return { prd: parsedPrd, path: join(rootArg, "prd.json") };
    });

    let caught: Error | null = null;
    try {
      await run(
        { root, projectRoot: root, provider: "docker", dryRun: true },
        store,
      );
    } catch (e) {
      caught = e as Error;
    } finally {
      spy.mockRestore();
    }

    expect(caught).not.toBeNull();
    expect(caught!.message).toMatch(/policy fields changed during run/);
    expect(existsSync(join(root, "last-run-policy-mismatch.json"))).toBe(true);
    const mismatch = JSON.parse(
      await readFile(join(root, "last-run-policy-mismatch.json"), "utf8"),
    ) as {
      snapshot: { deploymentAllowed: boolean };
      current: { deploymentAllowed: boolean };
      "fields-that-differ": string[];
    };
    expect(mismatch.snapshot.deploymentAllowed).toBe(false);
    expect(mismatch.current.deploymentAllowed).toBe(true);
    expect(mismatch["fields-that-differ"]).toContain("deploymentAllowed");
  }, 15000);
});
