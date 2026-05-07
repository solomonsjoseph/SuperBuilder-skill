// Policy integrity helpers. The scheduler snapshots a hash of the PRD's
// security-relevant fields at run start and re-hashes before each story to
// detect mid-run policy mutation by a subagent. See docs/SECURITY.md
// "Policy integrity" and Issue #4.

import { createHash } from "node:crypto";
import type { PRD } from "./types.js";

// Fields included in the policy hash. Everything else (titles, story state,
// progress) is allowed to mutate freely; these four are the trust boundary.
const POLICY_FIELDS = [
  "deploymentAllowed",
  "humanApprovalRequiredFor",
  "qualityGates",
  "sourceRefs",
] as const;

export type PolicyField = (typeof POLICY_FIELDS)[number];

export interface PolicySnapshot {
  deploymentAllowed: boolean;
  humanApprovalRequiredFor: string[];
  qualityGates: PRD["qualityGates"];
  sourceRefs: PRD["sourceRefs"];
}

/**
 * SHA-256 of canonicalized JSON containing exactly the four policy fields.
 * Canonicalization sorts object keys recursively (stable) and produces no
 * whitespace. `humanApprovalRequiredFor` is sorted alphabetically so that
 * key order in the source array does not change the hash.
 */
export function policyHash(prd: PRD): string {
  const snapshot = extractPolicy(prd);
  const canonical = canonicalize(snapshot);
  return createHash("sha256").update(canonical).digest("hex");
}

export function extractPolicy(prd: PRD): PolicySnapshot {
  return {
    deploymentAllowed: prd.deploymentAllowed,
    humanApprovalRequiredFor: [...(prd.humanApprovalRequiredFor ?? [])].sort(),
    qualityGates: prd.qualityGates,
    sourceRefs: prd.sourceRefs,
  };
}

/**
 * Compare two policy snapshots and return the list of top-level fields that
 * differ. Used to populate `.superbuilder/last-run-policy-mismatch.json`
 * when the scheduler detects a mid-run mutation.
 */
export function policyDiff(a: PolicySnapshot, b: PolicySnapshot): PolicyField[] {
  const out: PolicyField[] = [];
  for (const f of POLICY_FIELDS) {
    if (canonicalize(a[f]) !== canonicalize(b[f])) out.push(f);
  }
  return out;
}

/**
 * Recursive stable-sort + JSON serialization with no whitespace. Arrays
 * preserve order (callers normalize the one array we care about explicitly
 * inside `extractPolicy`); object keys are sorted alphabetically.
 */
function canonicalize(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return "[" + value.map(canonicalize).join(",") + "]";
  }
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  const parts = keys.map((k) => JSON.stringify(k) + ":" + canonicalize(obj[k]));
  return "{" + parts.join(",") + "}";
}
