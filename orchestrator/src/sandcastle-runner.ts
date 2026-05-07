// Sandcastle adapter — verified against @ai-hero/sandcastle ^0.5.8 on
// 2026-05-07. See .superbuilder/source-lock.json. Per the spec, autonomous
// story execution must always be sandboxed; one story = one branch.
//
// Surface contract is intentionally narrow so the scheduler doesn't have to
// know about Effect-flavoured types. All Sandcastle types stay behind the
// `SandboxAdapter` interface.

import {
  createSandbox as scCreateSandbox,
  claudeCode,
} from "@ai-hero/sandcastle";
import type {
  Sandbox as ScSandbox,
  SandboxRunResult as ScSandboxRunResult,
} from "@ai-hero/sandcastle";
import { detectPackageManager, installCommand } from "./package-manager.js";

export type Provider = "docker" | "podman" | "vercel";

export interface SandboxOptions {
  branch: string;
  provider: Provider;
  projectRoot: string;
}

export interface RunOptions {
  name: string;
  promptFile: string;
  maxIterations: number;
  /** Optional model name; defaults to "claude-opus-4-7". */
  model?: string;
  idleTimeoutSeconds?: number;
}

export interface SandboxRunResult {
  ok: boolean;
  notes: string;
  /** Commits that landed during this run (sandcastle's own list). */
  commits: string[];
}

export interface SandboxAdapter {
  /** Branch name on the host repo (set by createSandbox). */
  readonly branch: string;
  /** Worktree path on the host. */
  readonly worktreePath: string;
  ready(): Promise<void>;
  run(opts: RunOptions): Promise<SandboxRunResult>;
  close(): Promise<void>;
}

/**
 * Test/runtime hook. When set, `createSandbox` will use the stub instead of
 * importing the real sandcastle provider modules. This keeps unit tests fast
 * and lets us avoid pulling daemon-bound peer dependencies (docker/podman)
 * during `vitest`.
 */
export interface SandcastleStub {
  createSandbox: (opts: {
    branch: string;
    provider: Provider;
    projectRoot: string;
    install: string | null;
  }) => Promise<ScSandbox>;
}

declare global {
  // eslint-disable-next-line no-var
  var __sandcastleStub__: SandcastleStub | undefined;
}

interface ProviderModule {
  readonly factory: () => unknown;
}

async function loadProviderModule(provider: Provider): Promise<ProviderModule> {
  switch (provider) {
    case "docker": {
      const mod = await import("@ai-hero/sandcastle/sandboxes/docker");
      return { factory: () => mod.docker() };
    }
    case "podman": {
      const mod = await import("@ai-hero/sandcastle/sandboxes/podman");
      return { factory: () => mod.podman() };
    }
    case "vercel": {
      // Peer dep `@vercel/sandbox` is only required when this branch fires.
      const mod = await import("@ai-hero/sandcastle/sandboxes/vercel");
      return { factory: () => mod.vercel() };
    }
    default: {
      const _exhaustive: never = provider;
      throw new Error(`Unknown sandbox provider: ${String(_exhaustive)}`);
    }
  }
}

export async function createSandbox(
  opts: SandboxOptions,
): Promise<SandboxAdapter> {
  const pm = detectPackageManager(opts.projectRoot);
  const install = installCommand(pm);

  const stub = globalThis.__sandcastleStub__;
  let sb: ScSandbox;
  if (stub) {
    sb = await stub.createSandbox({
      branch: opts.branch,
      provider: opts.provider,
      projectRoot: opts.projectRoot,
      install,
    });
  } else {
    const mod = await loadProviderModule(opts.provider);
    const sandboxProvider = mod.factory();
    sb = await scCreateSandbox({
      branch: opts.branch,
      sandbox: sandboxProvider as Parameters<typeof scCreateSandbox>[0]["sandbox"],
      cwd: opts.projectRoot,
      hooks: install
        ? { sandbox: { onSandboxReady: [{ command: install }] } }
        : undefined,
    });
  }

  return {
    branch: sb.branch,
    worktreePath: sb.worktreePath,
    async ready() {
      // sandcastle's createSandbox is eager — the worktree + container are
      // ready by the time we get the handle back.
    },
    async run(o: RunOptions): Promise<SandboxRunResult> {
      try {
        const result: ScSandboxRunResult = await sb.run({
          agent: claudeCode(o.model ?? "claude-opus-4-7"),
          promptFile: o.promptFile,
          maxIterations: o.maxIterations,
          name: o.name,
          idleTimeoutSeconds: o.idleTimeoutSeconds,
        });
        return {
          ok: true,
          notes: "ok",
          commits: result.commits.map((c) => c.sha),
        };
      } catch (e) {
        return { ok: false, notes: (e as Error).message, commits: [] };
      }
    },
    async close() {
      const dispose = (sb as { [Symbol.asyncDispose]?: () => Promise<void> })[
        Symbol.asyncDispose
      ];
      if (typeof dispose === "function") {
        await dispose.call(sb);
        return;
      }
      await sb.close();
    },
  };
}
