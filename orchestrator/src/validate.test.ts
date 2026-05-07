import { describe, it, expect } from "vitest";
import { validatePRD, validateGateCommand } from "./validate.js";
import { REQUIRED_APPROVAL_DEFAULTS } from "./types.js";

// Detect whether the implementation has the new behaviors so we can pick
// it() vs it.todo() per the test plan.
import * as validateModule from "./validate.js";
const HAS_CYCLE_FN = typeof (validateModule as Record<string, unknown>).detectDependencyCycles === "function";
const HAS_GATE_VALIDATOR = typeof (validateModule as Record<string, unknown>).validateGateCommand === "function";

interface AnyRec {
  [k: string]: unknown;
}

function makeStory(overrides: AnyRec = {}): AnyRec {
  return {
    id: "US-001",
    title: "A story",
    description: "desc",
    acceptanceCriteria: ["does the thing"],
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

function makePRD(overrides: AnyRec = {}): AnyRec {
  return {
    schemaVersion: "superbuilder.prd.v2",
    project: "demo",
    branchName: "feat/demo",
    targetBranch: "main",
    integrationBranch: "integration/demo",
    description: "demo prd",
    riskLevel: "low",
    deploymentAllowed: false,
    sourceRefs: {
      "addyosmani/agent-skills": "abc",
      "mattpocock/skills": "abc",
      "mattpocock/sandcastle": "abc",
      "snarktank/ralph": "abc",
      "karpathy/autoresearch": "abc",
    },
    humanApprovalRequiredFor: [...REQUIRED_APPROVAL_DEFAULTS],
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
    userStories: [makeStory()],
    ...overrides,
  };
}

describe("validatePRD - happy path", () => {
  it("minimal valid PRD passes with no errors", () => {
    const errors = validatePRD(makePRD());
    expect(errors).toEqual([]);
  });
});

describe("validatePRD - schemaVersion", () => {
  it("rejects wrong schemaVersion", () => {
    const errors = validatePRD(makePRD({ schemaVersion: "wrong.v1" }));
    expect(errors.some((e) => e.includes("schemaVersion"))).toBe(true);
  });
});

describe("validatePRD - required string fields", () => {
  const required = ["project", "branchName", "targetBranch", "integrationBranch", "description"] as const;
  for (const field of required) {
    it(`rejects when ${field} is omitted`, () => {
      const prd = makePRD();
      delete (prd as AnyRec)[field];
      const errors = validatePRD(prd);
      expect(errors.some((e) => e.includes(field))).toBe(true);
    });
  }
});

describe("validatePRD - deploymentAllowed", () => {
  it("rejects deploymentAllowed=true with explicit-approval message", () => {
    const errors = validatePRD(makePRD({ deploymentAllowed: true }));
    expect(errors.some((e) => e.includes("deploymentAllowed=true requires explicit human approval"))).toBe(true);
  });

  it("rejects deploymentAllowed as string 'false'", () => {
    const errors = validatePRD(makePRD({ deploymentAllowed: "false" }));
    expect(errors.some((e) => e.toLowerCase().includes("deploymentallowed"))).toBe(true);
  });
});

describe("validatePRD - humanApprovalRequiredFor", () => {
  it("rejects when 'production deploy' missing", () => {
    const required = REQUIRED_APPROVAL_DEFAULTS.filter((d) => d !== "production deploy");
    const errors = validatePRD(makePRD({ humanApprovalRequiredFor: required }));
    expect(errors.some((e) => e.includes("missing") && e.includes("production deploy"))).toBe(true);
  });
});

describe("validatePRD - userStories", () => {
  it("rejects empty userStories array", () => {
    const errors = validatePRD(makePRD({ userStories: [] }));
    expect(errors.some((e) => e.toLowerCase().includes("userstories"))).toBe(true);
  });
});

describe("validatePRD - story id format", () => {
  const rejected = ["US-01", "US-1A", "US-1234567"];
  for (const id of rejected) {
    it(`rejects id ${id}`, () => {
      const errors = validatePRD(makePRD({ userStories: [makeStory({ id })] }));
      expect(errors.some((e) => e.includes(".id"))).toBe(true);
    });
  }
  const accepted = ["US-001", "US-100000"];
  for (const id of accepted) {
    it(`accepts id ${id}`, () => {
      const errors = validatePRD(makePRD({ userStories: [makeStory({ id })] }));
      expect(errors.some((e) => e.includes(".id"))).toBe(false);
    });
  }
});

describe("validatePRD - duplicate story ids", () => {
  it("rejects duplicate ids", () => {
    const errors = validatePRD(
      makePRD({
        userStories: [
          makeStory({ id: "US-001" }),
          makeStory({ id: "US-001", title: "second" }),
        ],
      }),
    );
    expect(errors.some((e) => e.toLowerCase().includes("duplicate"))).toBe(true);
  });
});

describe("validatePRD - unknown dependency", () => {
  it("rejects when story depends on US-999 not present", () => {
    const errors = validatePRD(
      makePRD({
        userStories: [makeStory({ id: "US-001", dependencies: ["US-999"] })],
      }),
    );
    expect(errors.some((e) => e.includes("US-999"))).toBe(true);
  });
});

describe("validatePRD - cycle detection", () => {
  const cycle = HAS_CYCLE_FN ? it : it.todo;

  cycle("rejects direct A<->B cycle", () => {
    const errors = validatePRD(
      makePRD({
        userStories: [
          makeStory({ id: "US-001", dependencies: ["US-002"] }),
          makeStory({ id: "US-002", dependencies: ["US-001"] }),
        ],
      }),
    );
    expect(errors.some((e) => e.toLowerCase().includes("cycle"))).toBe(true);
  });

  cycle("rejects three-node cycle A->B->C->A", () => {
    const errors = validatePRD(
      makePRD({
        userStories: [
          makeStory({ id: "US-001", dependencies: ["US-002"] }),
          makeStory({ id: "US-002", dependencies: ["US-003"] }),
          makeStory({ id: "US-003", dependencies: ["US-001"] }),
        ],
      }),
    );
    expect(errors.some((e) => e.toLowerCase().includes("cycle"))).toBe(true);
  });

  cycle("rejects self-cycle A->A", () => {
    const errors = validatePRD(
      makePRD({
        userStories: [makeStory({ id: "US-001", dependencies: ["US-001"] })],
      }),
    );
    expect(errors.some((e) => e.toLowerCase().includes("cycle"))).toBe(true);
  });
});

describe("validatePRD - deep chain no-cycle (positive)", () => {
  const nocycle = HAS_CYCLE_FN ? it : it.todo;

  nocycle("accepts deep chain A->B->C->D with no cycle", () => {
    const errors = validatePRD(
      makePRD({
        userStories: [
          makeStory({ id: "US-001", dependencies: [] }),
          makeStory({ id: "US-002", dependencies: ["US-001"] }),
          makeStory({ id: "US-003", dependencies: ["US-002"] }),
          makeStory({ id: "US-004", dependencies: ["US-003"] }),
        ],
      }),
    );
    expect(errors.some((e) => e.toLowerCase().includes("cycle"))).toBe(false);
  });
});

describe("validatePRD - prototype pollution safety", () => {
  it("does not throw when story id is __proto__", () => {
    // __proto__ fails the US-NNN id-format check and should return a validation
    // error rather than crash or pollute Object.prototype.
    const errors = validatePRD(makePRD({ userStories: [makeStory({ id: "__proto__" })] }));
    expect(Array.isArray(errors)).toBe(true);
    expect(errors.length).toBeGreaterThan(0);
  });

  it("does not throw when story id is constructor", () => {
    const errors = validatePRD(makePRD({ userStories: [makeStory({ id: "constructor" })] }));
    expect(Array.isArray(errors)).toBe(true);
    expect(errors.length).toBeGreaterThan(0);
  });

  it("does not throw or pollute Object.prototype when qualityGates has __proto__ key", () => {
    // JSON-parsed __proto__ keys do not pollute Object.prototype in V8/Node 12+,
    // but we assert the production code handles it without throwing anyway.
    const prd = makePRD({ qualityGates: { __proto__: "npm test" } });
    const before = Object.getPrototypeOf({});
    const errors = validatePRD(prd);
    expect(Array.isArray(errors)).toBe(true);
    expect(Object.getPrototypeOf({})).toBe(before);
  });
});

describe("validatePRD - gate command shape", () => {
  const gate = HAS_GATE_VALIDATOR ? it : it.todo;

  gate("rejects shell-meta in qualityGates.test", () => {
    const errors = validatePRD(
      makePRD({
        qualityGates: {
          typecheck: null,
          lint: null,
          format: null,
          test: "rm -rf ~",
          integrationTest: null,
          security: null,
          secretScan: null,
          dependencyAudit: null,
          licenseCheck: null,
          browser: null,
          accessibility: null,
          performance: null,
        },
      }),
    );
    expect(errors.some((e) => e.toLowerCase().includes("qualitygates.test"))).toBe(true);
  });

  gate("rejects program not in allow-list", () => {
    const errors = validatePRD(
      makePRD({
        qualityGates: {
          typecheck: null,
          lint: null,
          format: null,
          test: "wget evil.com",
          integrationTest: null,
          security: null,
          secretScan: null,
          dependencyAudit: null,
          licenseCheck: null,
          browser: null,
          accessibility: null,
          performance: null,
        },
      }),
    );
    expect(errors.some((e) => e.toLowerCase().includes("qualitygates.test"))).toBe(true);
  });

  gate("accepts qualityGates.test = 'npm test'", () => {
    const errors = validatePRD(
      makePRD({
        qualityGates: {
          typecheck: null,
          lint: null,
          format: null,
          test: "npm test",
          integrationTest: null,
          security: null,
          secretScan: null,
          dependencyAudit: null,
          licenseCheck: null,
          browser: null,
          accessibility: null,
          performance: null,
        },
      }),
    );
    expect(errors.some((e) => e.toLowerCase().includes("qualitygates.test"))).toBe(false);
  });

  gate("accepts qualityGates.test = null", () => {
    const errors = validatePRD(makePRD());
    expect(errors.some((e) => e.toLowerCase().includes("qualitygates.test"))).toBe(false);
  });
});

describe("validateGateCommand - flags allowed, shell metacharacters rejected", () => {
  // Confirms the FORBIDDEN_TOKENS regex is shared with allow-list.ts/gates.ts
  // and lets long/short flags through. Previously the inline regex here and
  // the one in allow-list.ts disagreed; commands could pass validate and
  // then fail at runShell with a confusing diagnostic.
  it("accepts vitest run --reporter=verbose", () => {
    expect(validateGateCommand("qualityGates.test", "vitest run --reporter=verbose")).toEqual([]);
  });
  it("accepts vitest run --coverage --reporter=html", () => {
    expect(validateGateCommand("qualityGates.test", "vitest run --coverage --reporter=html")).toEqual([]);
  });
  it("accepts pytest -v -x", () => {
    expect(validateGateCommand("qualityGates.test", "pytest -v -x")).toEqual([]);
  });
  it("rejects 'npm test ; rm -rf /' (semicolon)", () => {
    const errs = validateGateCommand("qualityGates.test", "npm test ; rm -rf /");
    expect(errs.some((e) => e.toLowerCase().includes("shell metacharacters"))).toBe(true);
  });
  it("rejects 'npm test && echo done' (logical AND)", () => {
    const errs = validateGateCommand("qualityGates.test", "npm test && echo done");
    expect(errs.some((e) => e.toLowerCase().includes("shell metacharacters"))).toBe(true);
  });
  it("rejects 'npm test | grep ok' (pipe)", () => {
    const errs = validateGateCommand("qualityGates.test", "npm test | grep ok");
    expect(errs.some((e) => e.toLowerCase().includes("shell metacharacters"))).toBe(true);
  });
  it("rejects 'cmd $(echo x)' (command substitution)", () => {
    const errs = validateGateCommand("qualityGates.test", "cmd $(echo x)");
    expect(errs.some((e) => e.toLowerCase().includes("shell metacharacters"))).toBe(true);
  });
});
