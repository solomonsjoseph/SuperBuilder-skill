import { describe, it, expect } from "vitest";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { selectNextStory, evidenceComplete } from "./prd.js";
import type { PRD, UserStory } from "./types.js";

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
      tests: [],
      security: [],
      review: [],
      browser: [],
      accessibility: [],
      performance: [],
      commits: [],
      diffs: [],
    },
    ...overrides,
  };
}

function makePRD(stories: UserStory[]): PRD {
  return {
    schemaVersion: "superbuilder.prd.v2",
    project: "demo",
    branchName: "feat/demo",
    targetBranch: "main",
    integrationBranch: "integration/demo",
    description: "d",
    riskLevel: "low",
    deploymentAllowed: false,
    sourceRefs: {
      "addyosmani/agent-skills": "x",
      "mattpocock/skills": "x",
      "mattpocock/sandcastle": "x",
      "snarktank/ralph": "x",
      "karpathy/autoresearch": "x",
    },
    humanApprovalRequiredFor: [],
    qualityGates: {
      typecheck: null, lint: null, format: null, test: null,
      integrationTest: null, security: null, secretScan: null,
      dependencyAudit: null, licenseCheck: null, browser: null,
      accessibility: null, performance: null,
    },
    userStories: stories,
  };
}

describe("selectNextStory", () => {
  it("returns lowest-priority story when no dependencies", () => {
    const prd = makePRD([
      makeStory({ id: "US-001", priority: 5 }),
      makeStory({ id: "US-002", priority: 1 }),
      makeStory({ id: "US-003", priority: 3 }),
    ]);
    const next = selectNextStory(prd);
    expect(next?.id).toBe("US-002");
  });

  it("breaks ties on priority by id ascending", () => {
    const prd = makePRD([
      makeStory({ id: "US-003", priority: 1 }),
      makeStory({ id: "US-001", priority: 1 }),
      makeStory({ id: "US-002", priority: 1 }),
    ]);
    const next = selectNextStory(prd);
    expect(next?.id).toBe("US-001");
  });

  it("excludes a dependency-blocked story; selects sibling without deps", () => {
    const prd = makePRD([
      makeStory({ id: "US-001", priority: 1, dependencies: ["US-999"] }),
      makeStory({ id: "US-002", priority: 2, dependencies: [] }),
    ]);
    const next = selectNextStory(prd);
    expect(next?.id).toBe("US-002");
  });

  it("returns null when all stories pass", () => {
    const prd = makePRD([
      makeStory({ id: "US-001", passes: true }),
      makeStory({ id: "US-002", passes: true }),
    ]);
    expect(selectNextStory(prd)).toBeNull();
  });
});

describe("evidenceComplete", () => {
  it("empty commits + diffs => false", async () => {
    const dir = await mkdtemp(join(tmpdir(), "evd-"));
    const story = makeStory();
    expect(evidenceComplete(story, dir)).toBe(false);
  });

  it("commits=['sha'], diffs=['./diff.patch'] but file does not exist => true (Path-A only checks arrays)", async () => {
    const dir = await mkdtemp(join(tmpdir(), "evd-"));
    const story = makeStory({
      evidence: {
        tests: [],
        security: [],
        review: [],
        browser: [],
        accessibility: [],
        performance: [],
        commits: ["sha"],
        diffs: ["./diff.patch"],
      },
    });
    expect(evidenceComplete(story, dir)).toBe(true);
  });

  it("Path-A: commits + diffs populated => true", async () => {
    const dir = await mkdtemp(join(tmpdir(), "evd-"));
    const story = makeStory({
      evidence: {
        tests: [], security: [], review: [], browser: [], accessibility: [], performance: [],
        commits: ["abc"],
        diffs: ["./d.patch"],
      },
    });
    expect(evidenceComplete(story, dir)).toBe(true);
  });

  it("Path-B: file exists at <evidenceDir>/diff.patch non-empty => true", async () => {
    const dir = await mkdtemp(join(tmpdir(), "evd-"));
    await writeFile(join(dir, "diff.patch"), "diff --git a b\n");
    const story = makeStory();
    expect(evidenceComplete(story, dir)).toBe(true);
  });
});
