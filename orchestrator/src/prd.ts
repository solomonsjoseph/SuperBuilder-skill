import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import type { PRD, UserStory } from "./types.js";
import { validatePRD } from "./validate.js";

export interface PRDStore {
  prd: PRD;
  path: string;
}

export async function loadPRD(root: string): Promise<PRDStore> {
  const path = join(root, "prd.json");
  if (!existsSync(path)) {
    throw new Error(
      `Expected ${path}. Run /superbuilder:superbuild to generate it before invoking the orchestrator.`,
    );
  }
  const raw = await readFile(path, "utf8");
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    throw new Error(`Invalid JSON in ${path}: ${(e as Error).message}`);
  }
  const errors = validatePRD(parsed);
  if (errors.length) {
    throw new Error(`PRD validation failed:\n  - ${errors.join("\n  - ")}`);
  }
  return { prd: parsed as PRD, path };
}

export async function savePRD(store: PRDStore): Promise<void> {
  await mkdir(dirname(store.path), { recursive: true });
  await writeFile(store.path, JSON.stringify(store.prd, null, 2) + "\n", "utf8");
}

export function selectNextStory(prd: PRD): UserStory | null {
  const passed = new Set(prd.userStories.filter((s) => s.passes).map((s) => s.id));
  const eligible = prd.userStories.filter(
    (s) => !s.passes && s.dependencies.every((d) => passed.has(d)),
  );
  if (!eligible.length) return null;
  eligible.sort((a, b) => a.priority - b.priority || a.id.localeCompare(b.id));
  return eligible[0]!;
}

export function evidenceComplete(story: UserStory, evidenceDir: string): boolean {
  // A story may pass with empty evidence ONLY for a story whose acceptance criteria
  // are CI-side (e.g. "CI runs typecheck on PR open"). We still require commits + diffs.
  // Path A (orchestrator-captured): host-side git produced both commits and diffs.
  if (story.evidence.commits.length > 0 && story.evidence.diffs.length > 0) {
    return true;
  }
  // Path B (sandbox-emitted): a non-empty diff.patch sitting in the evidence dir.
  // This handles the case where the orchestrator process is not on the story branch
  // (e.g. the branch only exists inside Sandcastle) but the implementer agent (or an
  // external process) wrote the diff itself.
  const diffPath = join(evidenceDir, "diff.patch");
  if (existsSync(diffPath)) {
    try {
      const st = statSync(diffPath);
      if (st.size > 0) return true;
    } catch {
      // fallthrough
    }
  }
  return false;
}
