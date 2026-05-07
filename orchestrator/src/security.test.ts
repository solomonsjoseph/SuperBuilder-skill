import { describe, it, expect } from "vitest";
import { policyHash, extractPolicy, policyDiff } from "./security.js";
import type { PRD } from "./types.js";

function makePRD(overrides: Partial<PRD> = {}): PRD {
  return {
    schemaVersion: "superbuilder.prd.v2",
    project: "p",
    branchName: "b",
    targetBranch: "t",
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
    ],
    qualityGates: {
      typecheck: "tsc --noEmit",
      lint: null,
      format: null,
      test: "vitest run",
      integrationTest: null,
      security: null,
      secretScan: null,
      dependencyAudit: null,
      licenseCheck: null,
      browser: null,
      accessibility: null,
      performance: null,
    },
    userStories: [],
    ...overrides,
  };
}

describe("policyHash", () => {
  it("same input produces same hash", () => {
    const a = makePRD();
    const b = makePRD();
    expect(policyHash(a)).toBe(policyHash(b));
  });

  it("flipping deploymentAllowed produces a different hash", () => {
    const a = makePRD({ deploymentAllowed: false });
    const b = makePRD({ deploymentAllowed: true });
    expect(policyHash(a)).not.toBe(policyHash(b));
  });

  it("key order in humanApprovalRequiredFor does not matter", () => {
    const a = makePRD({
      humanApprovalRequiredFor: ["a", "b", "c"],
    });
    const b = makePRD({
      humanApprovalRequiredFor: ["c", "a", "b"],
    });
    expect(policyHash(a)).toBe(policyHash(b));
  });

  it("changing qualityGates changes the hash", () => {
    const a = makePRD();
    const b = makePRD({
      qualityGates: { ...makePRD().qualityGates, test: "vitest --run --reporter=verbose" },
    });
    expect(policyHash(a)).not.toBe(policyHash(b));
  });

  it("changing sourceRefs changes the hash", () => {
    const a = makePRD();
    const b = makePRD({
      sourceRefs: { ...makePRD().sourceRefs, "snarktank/ralph": "different-pin" },
    });
    expect(policyHash(a)).not.toBe(policyHash(b));
  });

  it("ignores fields outside the policy set (e.g. project, userStories)", () => {
    const a = makePRD({ project: "p1" });
    const b = makePRD({ project: "p2" });
    expect(policyHash(a)).toBe(policyHash(b));
  });
});

describe("policyDiff", () => {
  it("returns empty when policies match", () => {
    const a = extractPolicy(makePRD());
    const b = extractPolicy(makePRD());
    expect(policyDiff(a, b)).toEqual([]);
  });

  it("identifies which top-level fields changed", () => {
    const a = extractPolicy(makePRD());
    const b = extractPolicy(makePRD({ deploymentAllowed: true }));
    expect(policyDiff(a, b)).toEqual(["deploymentAllowed"]);
  });

  it("can flag multiple fields at once", () => {
    const a = extractPolicy(makePRD());
    const b = extractPolicy(
      makePRD({
        deploymentAllowed: true,
        humanApprovalRequiredFor: ["only one"],
      }),
    );
    expect(policyDiff(a, b).sort()).toEqual([
      "deploymentAllowed",
      "humanApprovalRequiredFor",
    ]);
  });
});
