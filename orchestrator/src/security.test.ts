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

  it("is symmetric: policyDiff(a,b) and policyDiff(b,a) report the same fields", () => {
    const a = extractPolicy(makePRD());
    const b = extractPolicy(
      makePRD({
        deploymentAllowed: true,
        sourceRefs: { ...makePRD().sourceRefs, "snarktank/ralph": "different-pin" },
      }),
    );
    expect(policyDiff(a, b).sort()).toEqual(policyDiff(b, a).sort());
  });
});

describe("policyHash canonicalization rejects ambiguous values", () => {
  it("throws when humanApprovalRequiredFor contains an explicit undefined", () => {
    const prd = makePRD({
      // Force a hole into the array. JSON.stringify would silently turn this
      // into `null`, collapsing distinct PRDs to one hash.
      humanApprovalRequiredFor: ["a", undefined as unknown as string, "b"],
    });
    expect(() => policyHash(prd)).toThrow(/undefined value/);
  });

  it("throws when qualityGates.test = NaN", () => {
    const prd = makePRD({
      qualityGates: {
        ...makePRD().qualityGates,
        test: NaN as unknown as string,
      },
    });
    expect(() => policyHash(prd)).toThrow(/non-finite number/);
  });

  it("distinguishes qualityGates.test = 'x' from qualityGates.test = null", () => {
    const a = makePRD({
      qualityGates: { ...makePRD().qualityGates, test: "x" },
    });
    const b = makePRD({
      qualityGates: { ...makePRD().qualityGates, test: null },
    });
    expect(policyHash(a)).not.toBe(policyHash(b));
  });

  it("nested object key order does not affect the hash", () => {
    // Re-emit qualityGates with keys in reverse alphabetical order. Hash
    // must remain stable because canonicalize sorts keys recursively.
    const base = makePRD();
    const src = base.qualityGates as unknown as Record<string, string | null>;
    const reordered: Record<string, string | null> = {};
    for (const k of Object.keys(src).reverse()) {
      reordered[k] = src[k] ?? null;
    }
    const b = makePRD({ qualityGates: reordered as unknown as PRD["qualityGates"] });
    expect(policyHash(base)).toBe(policyHash(b));
  });
});
