import { describe, it, expect } from "vitest";
import { defaultGates, type StackInfo } from "./gate-defaults.js";
import { validateGateCommand } from "./validate.js";

// Whitelist of QualityGates keys. Mirrors orchestrator/src/types.ts -- if a
// new gate is added there, it must be added here too.
const QUALITY_GATE_KEYS = new Set([
  "typecheck",
  "lint",
  "format",
  "test",
  "integrationTest",
  "security",
  "secretScan",
  "dependencyAudit",
  "licenseCheck",
  "browser",
  "accessibility",
  "performance",
]);

interface Case {
  name: string;
  stack: StackInfo;
  // Keys we expect the template to populate (existence check; we don't
  // pin exact strings here so the template stays editable).
  expectKeys: string[];
}

const CASES: Case[] = [
  {
    name: "Node + Next.js (npm)",
    stack: { packageManager: "npm", framework: "next", hasUI: true },
    expectKeys: ["typecheck", "test", "lint", "format", "browser", "accessibility", "performance"],
  },
  {
    name: "Node + Next.js (pnpm)",
    stack: { packageManager: "pnpm", framework: "next", hasUI: true },
    expectKeys: ["typecheck", "test", "lint", "format", "browser", "accessibility", "performance"],
  },
  {
    name: "Node + Vite",
    stack: { packageManager: "pnpm", framework: "vite", hasUI: true },
    expectKeys: ["typecheck", "test", "lint", "format", "browser", "accessibility", "performance"],
  },
  {
    name: "Node CLI / library",
    stack: { packageManager: "npm", framework: "none", hasUI: false },
    expectKeys: ["typecheck", "test", "lint", "format"],
  },
  {
    name: "Python + Django (poetry)",
    stack: { packageManager: "poetry", framework: "django" },
    expectKeys: ["test", "lint", "format", "security"],
  },
  {
    name: "Python + FastAPI (uv)",
    stack: { packageManager: "uv", framework: "fastapi" },
    expectKeys: ["test", "integrationTest", "lint", "format", "security"],
  },
  {
    name: "Rust crate",
    stack: { packageManager: "cargo" },
    expectKeys: ["typecheck", "test", "lint", "format"],
  },
  {
    name: "Go module",
    stack: { packageManager: "go" },
    expectKeys: ["test", "lint", "format"],
  },
];

describe("defaultGates", () => {
  for (const c of CASES) {
    describe(c.name, () => {
      const gates = defaultGates(c.stack);

      it("returns only keys defined in QualityGates", () => {
        const keys = Object.keys(gates);
        for (const k of keys) {
          expect(QUALITY_GATE_KEYS.has(k)).toBe(true);
        }
      });

      it("populates the expected gate keys", () => {
        for (const k of c.expectKeys) {
          expect(gates).toHaveProperty(k);
          // Each populated value must be a non-empty string (no nulls in
          // a default template — null means "user hasn't set this").
          const v = (gates as Record<string, unknown>)[k];
          expect(typeof v).toBe("string");
          expect((v as string).length).toBeGreaterThan(0);
        }
      });

      it("every command passes validateGateCommand", () => {
        for (const [gateName, value] of Object.entries(gates)) {
          const errors = validateGateCommand(`qualityGates.${gateName}`, value);
          expect(errors, `gate '${gateName}' = ${JSON.stringify(value)}`).toEqual([]);
        }
      });
    });
  }

  it("returns an empty object for an unknown stack", () => {
    const gates = defaultGates({ packageManager: "unknown" });
    expect(gates).toEqual({});
  });

  it("Node CLI with hasUI=true opts back into browser/a11y/perf", () => {
    const gates = defaultGates({ packageManager: "npm", framework: "none", hasUI: true });
    expect(gates).toHaveProperty("browser");
    expect(gates).toHaveProperty("accessibility");
    expect(gates).toHaveProperty("performance");
  });
});
