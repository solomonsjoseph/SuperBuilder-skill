import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { createSandbox } from "./sandcastle-runner.js";
import type { Provider } from "./sandcastle-runner.js";

// Minimal shape of the sandcastle Sandbox that our adapter consumes. The
// stub forges this directly so tests don't need docker/podman.
interface FakeSandcastleSandbox {
  branch: string;
  worktreePath: string;
  run: (opts: unknown) => Promise<{
    iterations: unknown[];
    stdout: string;
    commits: { sha: string }[];
    completionSignal?: string;
    logFilePath?: string;
  }>;
  interactive: () => Promise<{ commits: { sha: string }[]; exitCode: number }>;
  close: () => Promise<{ preservedWorktreePath?: string }>;
  [Symbol.asyncDispose]?: () => Promise<void>;
}

interface StubCall {
  branch: string;
  provider: Provider;
  projectRoot: string;
  install: string | null;
}

interface RunCall {
  // Captured args from the latest sb.run() invocation.
  agent: { name: string };
  promptFile?: string;
  prompt?: string;
  maxIterations?: number;
  name?: string;
  idleTimeoutSeconds?: number;
}

function installStub(
  options: {
    commits?: string[];
    throwOnRun?: boolean;
  } = {},
): { calls: StubCall[]; runs: RunCall[]; closed: number } {
  const calls: StubCall[] = [];
  const runs: RunCall[] = [];
  let closed = 0;

  globalThis.__sandcastleStub__ = {
    async createSandbox(opts) {
      calls.push(opts);
      const sb: FakeSandcastleSandbox = {
        branch: opts.branch,
        worktreePath: `/tmp/fake-worktree/${opts.branch}`,
        async run(runOpts) {
          runs.push(runOpts as RunCall);
          if (options.throwOnRun) {
            throw new Error("simulated sandcastle run failure");
          }
          return {
            iterations: [{}],
            stdout: "",
            commits: (options.commits ?? []).map((sha) => ({ sha })),
          };
        },
        async interactive() {
          return { commits: [], exitCode: 0 };
        },
        async close() {
          closed++;
          return {};
        },
      };
      return sb as unknown as Awaited<ReturnType<typeof opts extends never ? never : never>>;
    },
  };

  return { calls, runs, get closed() { return closed; } } as unknown as {
    calls: StubCall[]; runs: RunCall[]; closed: number;
  };
}

describe("sandcastle-runner adapter", () => {
  let tmp: string;
  beforeEach(async () => {
    tmp = await mkdtemp(join(tmpdir(), "sb-runner-"));
    // Make package-manager detection deterministic — empty dir = "unknown".
  });
  afterEach(async () => {
    delete globalThis.__sandcastleStub__;
    await rm(tmp, { recursive: true, force: true });
  });

  it("createSandbox passes branch+provider+projectRoot to the stub and returns adapter", async () => {
    const stub = installStub({ commits: [] });

    const adapter = await createSandbox({
      branch: "superbuilder/US-001-foo",
      provider: "docker",
      projectRoot: tmp,
    });

    expect(stub.calls).toHaveLength(1);
    const call0 = stub.calls[0]!;
    expect(call0.branch).toBe("superbuilder/US-001-foo");
    expect(call0.provider).toBe("docker");
    expect(call0.projectRoot).toBe(tmp);
    expect(adapter.branch).toBe("superbuilder/US-001-foo");
    expect(typeof adapter.worktreePath).toBe("string");

    await adapter.close();
  });

  it("run() forwards promptFile, name, maxIterations and uses claudeCode default model", async () => {
    const stub = installStub({ commits: [] });
    const adapter = await createSandbox({
      branch: "b",
      provider: "podman",
      projectRoot: tmp,
    });

    const promptFile = join(tmp, "p.md");
    await writeFile(promptFile, "# prompt\n");

    await adapter.run({
      name: "implement-US-001",
      promptFile,
      maxIterations: 1,
    });

    expect(stub.runs).toHaveLength(1);
    const r = stub.runs[0]!;
    expect(r.name).toBe("implement-US-001");
    expect(r.promptFile).toBe(promptFile);
    expect(r.maxIterations).toBe(1);
    // claudeCode("claude-opus-4-7") returns an AgentProvider whose .name is "claude-code".
    expect(r.agent.name).toBe("claude-code");
    await adapter.close();
  });

  it("run() maps result.commits[].sha into a flat string[]", async () => {
    installStub({ commits: ["abc123", "def456"] });
    const adapter = await createSandbox({
      branch: "b",
      provider: "docker",
      projectRoot: tmp,
    });

    const result = await adapter.run({
      name: "x",
      promptFile: "/dev/null",
      maxIterations: 1,
    });

    expect(result.ok).toBe(true);
    expect(result.notes).toBe("ok");
    expect(result.commits).toEqual(["abc123", "def456"]);
    await adapter.close();
  });

  it("run() returns {ok:false} on thrown error and notes carries the message", async () => {
    installStub({ throwOnRun: true });
    const adapter = await createSandbox({
      branch: "b",
      provider: "docker",
      projectRoot: tmp,
    });

    const result = await adapter.run({
      name: "x",
      promptFile: "/dev/null",
      maxIterations: 1,
    });

    expect(result.ok).toBe(false);
    expect(result.notes).toContain("simulated sandcastle run failure");
    expect(result.commits).toEqual([]);
    await adapter.close();
  });
});

// Integration test — only runs when SUPERBUILDER_INTEGRATION=1 is set. It
// boots a real docker-backed sandbox, runs a tiny claudeCode prompt, and
// asserts at least one commit is reported.
describe("sandcastle-runner integration (docker)", () => {
  it.skipIf(process.env.SUPERBUILDER_INTEGRATION !== "1")(
    "creates a sandbox, runs an agent, and surfaces a commit",
    async () => {
      const repo = await mkdtemp(join(tmpdir(), "sb-int-"));
      // Bootstrap a real git repo so sandcastle can create a worktree.
      const initOk = spawnSync("git", ["init", "-q", "-b", "main"], { cwd: repo }).status === 0;
      expect(initOk).toBe(true);
      spawnSync("git", ["config", "user.email", "test@example.com"], { cwd: repo });
      spawnSync("git", ["config", "user.name", "test"], { cwd: repo });
      await writeFile(join(repo, "README.md"), "seed\n");
      spawnSync("git", ["add", "."], { cwd: repo });
      spawnSync("git", ["commit", "-q", "-m", "seed"], { cwd: repo });

      const promptFile = join(repo, "prompt.md");
      await writeFile(
        promptFile,
        "Create a file `hello.txt` containing the word `world`. Then commit it with message 'add hello'.\n",
      );

      const adapter = await createSandbox({
        branch: "superbuilder/it-001-hello",
        provider: "docker",
        projectRoot: repo,
      });
      try {
        const result = await adapter.run({
          name: "integration",
          promptFile,
          maxIterations: 2,
          idleTimeoutSeconds: 300,
        });
        expect(result.ok).toBe(true);
        expect(result.commits.length).toBeGreaterThanOrEqual(1);
      } finally {
        await adapter.close();
        await rm(repo, { recursive: true, force: true });
      }
    },
    600_000,
  );
});
