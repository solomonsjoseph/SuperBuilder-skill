// Sandcastle adapter. Imports lazily so the orchestrator still compiles
// and runs validation/gates without sandcastle installed. Per the spec,
// autonomous story execution must always be sandboxed; one story = one
// sandbox = one branch.
//
// IMPORTANT: this adapter is intentionally schema-narrow. The actual
// Sandcastle API surface (createSandbox, run, hooks shape) must be
// verified against the upstream package version pinned in
// .superbuilder/source-lock.json before relying on these calls.

import { detectPackageManager, installCommand } from "./package-manager.js";

export type Provider = "docker" | "podman" | "vercel";

export interface SandboxOptions {
  branch: string;
  provider: Provider;
  projectRoot: string;
}

export interface RunOptions {
  name: string;
  agent: string;       // agent identifier (e.g. "implementer")
  promptFile: string;  // path to a prompt the agent will read
  maxIterations: number;
}

export interface SandboxRunResult {
  ok: boolean;
  notes: string;
}

export interface SandboxAdapter {
  ready(): Promise<void>;
  run(opts: RunOptions): Promise<SandboxRunResult>;
  close(): Promise<void>;
}

export async function createSandbox(opts: SandboxOptions): Promise<SandboxAdapter> {
  const sandcastle = await loadSandcastle();
  if (!sandcastle) {
    throw new Error(
      "sandcastle is not installed. Install with `npm i sandcastle` (or your project's package manager) " +
        "in orchestrator/. Autonomous story execution requires a sandbox; refusing to run without one.",
    );
  }
  const pm = detectPackageManager(opts.projectRoot);
  const install = installCommand(pm);

  const sb = await sandcastle.createSandbox({
    branch: opts.branch,
    sandbox: opts.provider,
    hooks: install
      ? { sandbox: { onSandboxReady: [{ command: install }] } }
      : undefined,
  });

  return {
    async ready() { /* sandcastle creates ready */ },
    async run(o) {
      try {
        await sb.run({
          name: o.name,
          agent: o.agent,
          promptFile: o.promptFile,
          maxIterations: o.maxIterations,
        });
        return { ok: true, notes: `${o.name} completed` };
      } catch (e) {
        return { ok: false, notes: (e as Error).message };
      }
    },
    async close() {
      const dispose = sb[Symbol.asyncDispose];
      if (typeof dispose === "function") {
        await dispose.call(sb);
        return;
      }
      const closer = (sb as unknown as { close?: () => Promise<void> }).close;
      if (typeof closer === "function") {
        await closer.call(sb);
      }
    },
  };
}

interface SandcastleModule {
  createSandbox: (opts: unknown) => Promise<SandcastleSandbox>;
}

interface SandcastleSandbox {
  run: (opts: unknown) => Promise<unknown>;
  [Symbol.asyncDispose]?: () => Promise<void>;
}

async function loadSandcastle(): Promise<SandcastleModule | null> {
  try {
    // The sandcastle package may not be installed; resolved at runtime.
    // @ts-expect-error - optional dependency without bundled types
    const mod = await import("sandcastle");
    return mod as unknown as SandcastleModule;
  } catch {
    return null;
  }
}
