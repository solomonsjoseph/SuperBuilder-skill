// PRD validator. Hand-rolled because we don't ship JSON Schema runtime here
// and the structure is stable. Returns an array of human-readable errors.

import type { PRD, UserStory } from "./types.js";
import { REQUIRED_APPROVAL_DEFAULTS } from "./types.js";
import { ALLOWED_PROGRAMS, FORBIDDEN_TOKENS } from "./allow-list.js";

export function validatePRD(value: unknown): string[] {
  const errors: string[] = [];
  if (!isObject(value)) {
    return ["PRD root is not an object"];
  }
  const prd = value as Partial<PRD>;

  if (prd.schemaVersion !== "superbuilder.prd.v2") {
    errors.push(`schemaVersion must be "superbuilder.prd.v2", got ${JSON.stringify(prd.schemaVersion)}`);
  }
  for (const field of ["project", "branchName", "targetBranch", "integrationBranch", "description"] as const) {
    if (typeof prd[field] !== "string" || !prd[field]) {
      errors.push(`Missing or empty string field: ${field}`);
    }
  }
  if (prd.deploymentAllowed !== false && prd.deploymentAllowed !== true) {
    errors.push("deploymentAllowed must be a boolean (default false)");
  }
  if (prd.deploymentAllowed === true) {
    errors.push("deploymentAllowed=true requires explicit human approval; orchestrator will refuse to start");
  }

  if (!Array.isArray(prd.humanApprovalRequiredFor)) {
    errors.push("humanApprovalRequiredFor must be an array");
  } else {
    const missing = REQUIRED_APPROVAL_DEFAULTS.filter((d) => !prd.humanApprovalRequiredFor!.includes(d));
    if (missing.length) {
      errors.push(`humanApprovalRequiredFor missing required entries: ${missing.join(", ")}`);
    }
  }

  if (!isObject(prd.qualityGates)) {
    errors.push("qualityGates must be an object (string commands or null per gate)");
  } else {
    for (const [gateName, gateValue] of Object.entries(prd.qualityGates)) {
      errors.push(...validateGateCommand(`qualityGates.${gateName}`, gateValue));
    }
  }
  if (!isObject(prd.sourceRefs)) {
    errors.push("sourceRefs must be an object pinning each upstream source");
  }

  if (!Array.isArray(prd.userStories) || prd.userStories.length === 0) {
    errors.push("userStories must be a non-empty array");
  } else {
    const ids = new Set<string>();
    for (const [i, s] of prd.userStories.entries()) {
      const tag = `userStories[${i}]`;
      const sErrors = validateStory(s, tag);
      errors.push(...sErrors);
      if (typeof s?.id === "string") {
        if (ids.has(s.id)) errors.push(`${tag}: duplicate id ${s.id}`);
        ids.add(s.id);
      }
    }
    // Resolve dependencies
    for (const s of prd.userStories as UserStory[]) {
      if (Array.isArray(s.dependencies)) {
        for (const d of s.dependencies) {
          if (!ids.has(d)) errors.push(`Story ${s.id} depends on unknown story id ${d}`);
        }
      }
    }
    // Detect dependency cycles between user stories.
    errors.push(...detectDependencyCycles(prd.userStories as UserStory[]));
  }

  return errors;
}

export function validateGateCommand(name: string, value: unknown): string[] {
  if (value === null) return [];
  if (typeof value !== "string") {
    return [`${name}: must be string or null`];
  }
  // Mirror gates.ts exactly — single source of truth lives in allow-list.ts.
  // Previously this used an inline regex that diverged from FORBIDDEN_TOKENS,
  // which let strings pass validate but fail at runShell with a confusing
  // diagnostic.
  if (FORBIDDEN_TOKENS.test(value)) {
    return [`${name}: shell metacharacters not permitted in gate commands`];
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return [`${name}: shell metacharacters not permitted in gate commands`];
  }
  const first = trimmed.split(/\s+/)[0] ?? "";
  if (!ALLOWED_PROGRAMS.has(first)) {
    return [`${name}: program '${first}' not in allow-list. See docs/SECURITY.md`];
  }
  return [];
}

export function detectDependencyCycles(stories: UserStory[]): string[] {
  const errors: string[] = [];
  const graph = new Map<string, string[]>();
  for (const s of stories) {
    if (typeof s?.id !== "string") continue;
    const deps = Array.isArray(s.dependencies) ? s.dependencies : [];
    graph.set(s.id, deps);
  }

  // White = unvisited, Gray = in current DFS stack, Black = fully explored.
  const WHITE = 0, GRAY = 1, BLACK = 2;
  const color = new Map<string, number>();
  for (const id of graph.keys()) color.set(id, WHITE);

  const stack: string[] = [];

  function dfs(node: string): void {
    color.set(node, GRAY);
    stack.push(node);
    const deps = graph.get(node) ?? [];
    for (const next of deps) {
      if (!graph.has(next)) continue; // unknown-dep error already reported elsewhere
      const c = color.get(next) ?? WHITE;
      if (c === GRAY) {
        // Back-edge: extract cycle slice from stack from `next` onwards.
        const idx = stack.indexOf(next);
        const cycle = stack.slice(idx).concat(next);
        errors.push(`cycle detected: ${cycle.join(" -> ")}`);
      } else if (c === WHITE) {
        dfs(next);
      }
    }
    stack.pop();
    color.set(node, BLACK);
  }

  for (const id of graph.keys()) {
    if ((color.get(id) ?? WHITE) === WHITE) {
      dfs(id);
    }
  }
  return errors;
}

function validateStory(value: unknown, tag: string): string[] {
  const errors: string[] = [];
  if (!isObject(value)) {
    return [`${tag}: not an object`];
  }
  const s = value as Partial<UserStory>;
  if (typeof s.id !== "string" || !/^US-\d{3,6}$/.test(s.id)) {
    errors.push(`${tag}.id must match /^US-\\d{3,6}$/ (e.g. US-001)`);
  }
  for (const f of ["title", "description"] as const) {
    if (typeof s[f] !== "string" || !s[f]) errors.push(`${tag}.${f} required`);
  }
  if (!Array.isArray(s.acceptanceCriteria) || s.acceptanceCriteria.length < 1) {
    errors.push(`${tag}.acceptanceCriteria must have at least 1 entry`);
  }
  if (typeof s.priority !== "number") errors.push(`${tag}.priority must be a number`);
  if (!["low", "medium", "high"].includes(s.riskLevel as string)) errors.push(`${tag}.riskLevel must be low|medium|high`);
  if (s.passes !== false && s.passes !== true) errors.push(`${tag}.passes must be boolean`);
  if (typeof s.attempts !== "number") errors.push(`${tag}.attempts must be a number`);
  return errors;
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}
