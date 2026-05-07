// PRD validator. Hand-rolled because we don't ship JSON Schema runtime here
// and the structure is stable. Returns an array of human-readable errors.

import type { PRD, UserStory } from "./types.js";
import { REQUIRED_APPROVAL_DEFAULTS } from "./types.js";

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
  }

  return errors;
}

function validateStory(value: unknown, tag: string): string[] {
  const errors: string[] = [];
  if (!isObject(value)) {
    return [`${tag}: not an object`];
  }
  const s = value as Partial<UserStory>;
  if (typeof s.id !== "string" || !/^US-\d{3,}$/.test(s.id)) {
    errors.push(`${tag}.id must match /^US-\\d{3,}$/ (e.g. US-001)`);
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
