import { describe, it, expect, afterEach } from "vitest";
import { createServer, type Server, type IncomingMessage, type ServerResponse } from "node:http";
import { mkdtemp, writeFile, readdir, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { _runAudit, classify, parseLinkNext, computeBackoffMs } from "./source-audit.js";

type Handler = (req: IncomingMessage, res: ServerResponse) => void;

async function startServer(handler: Handler): Promise<{ server: Server; baseUrl: string }> {
  const server = createServer(handler);
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
  const addr = server.address();
  if (!addr || typeof addr === "string") throw new Error("no address");
  return { server, baseUrl: `http://127.0.0.1:${addr.port}` };
}

async function stopServer(server: Server): Promise<void> {
  await new Promise<void>((r) => server.close(() => r()));
}

async function mkLockDir(sources: Record<string, { ref: string }>): Promise<{
  dir: string;
  lockPath: string;
  outDir: string;
}> {
  const dir = await mkdtemp(join(tmpdir(), "src-audit-"));
  const lockPath = join(dir, "source-lock.json");
  await writeFile(
    lockPath,
    JSON.stringify({ sources: Object.fromEntries(Object.entries(sources).map(([k, v]) => [k, { ...v, lastChecked: null }])) }),
    "utf8",
  );
  return { dir, lockPath, outDir: join(dir, "audits") };
}

let activeServer: Server | null = null;
afterEach(async () => {
  if (activeServer) {
    await stopServer(activeServer);
    activeServer = null;
  }
});

describe("parseLinkNext", () => {
  it("extracts the next URL", () => {
    const h = '<https://api.github.com/x?page=2>; rel="next", <https://api.github.com/x?page=5>; rel="last"';
    expect(parseLinkNext(h)).toBe("https://api.github.com/x?page=2");
  });
  it("returns null with no next", () => {
    expect(parseLinkNext('<https://x>; rel="last"')).toBeNull();
    expect(parseLinkNext(null)).toBeNull();
  });
});

describe("classify", () => {
  it("flags security regardless of other content", () => {
    expect(classify([{ filename: "skills/security/policy.md", status: "modified", additions: 1, deletions: 0, changes: 1 }])).toBe("security");
  });
  it("breaking when package.json + removal", () => {
    expect(
      classify([
        { filename: "package.json", status: "modified", additions: 1, deletions: 1, changes: 2 },
        { filename: "src/old.ts", status: "removed", additions: 0, deletions: 10, changes: 10 },
      ]),
    ).toBe("breaking");
  });
  it("irrelevant when only docs", () => {
    expect(classify([{ filename: "README.md", status: "modified", additions: 1, deletions: 0, changes: 1 }])).toBe("irrelevant");
  });
  it("capability when only added", () => {
    expect(classify([{ filename: "src/new.ts", status: "added", additions: 5, deletions: 0, changes: 5 }])).toBe("capability");
  });
});

describe("computeBackoffMs", () => {
  it("honors retry-after", () => {
    const res = new Response("", { headers: { "retry-after": "3" } });
    expect(computeBackoffMs(res, 1)).toBe(3000);
  });
  it("falls back to exponential when no headers", () => {
    const res = new Response("", { headers: {} });
    expect(computeBackoffMs(res, 1)).toBe(1000);
    expect(computeBackoffMs(res, 3)).toBe(4000);
  });
});

describe("_runAudit pagination", () => {
  it("loops Link rel=next until exhausted", async () => {
    const { lockPath, outDir } = await mkLockDir({ "octo/repo": { ref: "abc123" } });
    const calls: string[] = [];
    const { server, baseUrl } = await startServer((req, res) => {
      calls.push(req.url ?? "");
      res.setHeader("content-type", "application/json");
      if (req.url === "/repos/octo/repo") {
        res.end(JSON.stringify({ default_branch: "main" }));
        return;
      }
      if (req.url?.startsWith("/repos/octo/repo/commits/main")) {
        res.end(JSON.stringify({ sha: "head456" }));
        return;
      }
      if (req.url?.includes("/compare/")) {
        const u = new URL(req.url, baseUrl);
        const page = u.searchParams.get("page") ?? "1";
        if (page === "1") {
          res.setHeader("link", `<${baseUrl}/repos/octo/repo/compare/abc123...head456?per_page=100&page=2>; rel="next"`);
          res.end(JSON.stringify({ files: [{ filename: "src/a.ts", status: "modified", additions: 1, deletions: 1, changes: 2 }] }));
          return;
        }
        // page 2 — last page, no Link rel=next
        res.end(JSON.stringify({ files: [{ filename: "src/b.ts", status: "modified", additions: 1, deletions: 1, changes: 2 }] }));
        return;
      }
      res.statusCode = 404;
      res.end("{}");
    });
    activeServer = server;

    const results = await _runAudit({ sourceLockPath: lockPath, outputDir: outDir, apiBase: baseUrl });
    expect(results).toHaveLength(1);
    expect(results[0]!.filesChanged).toBe(2);
    expect(results[0]!.error).toBeUndefined();
    expect(calls.filter((c) => c.includes("/compare/"))).toHaveLength(2);

    const audits = await readdir(outDir);
    expect(audits.some((f) => f.startsWith("AUDIT-") && f.endsWith(".md"))).toBe(true);
  });
});

describe("_runAudit rate-limit backoff", () => {
  it("retries after 429 retry-after, then succeeds", async () => {
    const { lockPath, outDir } = await mkLockDir({ "octo/repo": { ref: "abc123" } });
    let compareHits = 0;
    const sleeps: number[] = [];
    const { server, baseUrl } = await startServer((req, res) => {
      if (req.url === "/repos/octo/repo") {
        res.end(JSON.stringify({ default_branch: "main" }));
        return;
      }
      if (req.url?.startsWith("/repos/octo/repo/commits/main")) {
        res.end(JSON.stringify({ sha: "head456" }));
        return;
      }
      if (req.url?.includes("/compare/")) {
        compareHits++;
        if (compareHits === 1) {
          res.statusCode = 429;
          res.setHeader("retry-after", "2");
          res.end("rate limited");
          return;
        }
        res.end(JSON.stringify({ files: [{ filename: "src/x.ts", status: "modified", additions: 1, deletions: 1, changes: 2 }] }));
        return;
      }
      res.statusCode = 404;
      res.end("{}");
    });
    activeServer = server;

    const fakeSleep = async (ms: number) => { sleeps.push(ms); };
    const results = await _runAudit({ sourceLockPath: lockPath, outputDir: outDir, apiBase: baseUrl, sleep: fakeSleep });
    expect(compareHits).toBe(2);
    expect(sleeps).toContain(2000); // honored retry-after
    expect(results[0]!.filesChanged).toBe(1);
  });
});

describe("_runAudit truncation breaks the page loop", () => {
  it("stops fetching once threshold is crossed (5-page mock, only fetches up to truncation)", async () => {
    const { lockPath, outDir } = await mkLockDir({ "octo/repo": { ref: "abc123" } });
    const compareCalls: number[] = [];
    const TOTAL_PAGES = 5;
    const FILES_PER_PAGE = 100;
    const { server, baseUrl } = await startServer((req, res) => {
      res.setHeader("content-type", "application/json");
      if (req.url === "/repos/octo/repo") return void res.end(JSON.stringify({ default_branch: "main" }));
      if (req.url?.startsWith("/repos/octo/repo/commits/main")) return void res.end(JSON.stringify({ sha: "h" }));
      if (req.url?.includes("/compare/")) {
        const u = new URL(req.url, baseUrl);
        const page = parseInt(u.searchParams.get("page") ?? "1", 10);
        compareCalls.push(page);
        const filesOnPage = Array.from({ length: FILES_PER_PAGE }, (_, i) => ({
          filename: `src/p${page}-f${i}.ts`,
          status: "modified",
          additions: 1,
          deletions: 1,
          changes: 2,
        }));
        if (page < TOTAL_PAGES) {
          res.setHeader(
            "link",
            `<${baseUrl}/repos/octo/repo/compare/abc123...h?per_page=100&page=${page + 1}>; rel="next"`,
          );
        }
        return void res.end(JSON.stringify({ files: filesOnPage }));
      }
      res.statusCode = 404;
      res.end("{}");
    });
    activeServer = server;

    const results = await _runAudit({ sourceLockPath: lockPath, outputDir: outDir, apiBase: baseUrl });
    expect(results[0]!.truncated).toBe(true);
    // Truncation threshold is 250 files; 100/200 still under, after page 3 (300) we trip.
    // We must NOT have walked all 5 pages.
    expect(compareCalls).toEqual([1, 2, 3]);
    // filesChanged reflects what we actually fetched (300), not the full 500.
    expect(results[0]!.filesChanged).toBe(300);
  });

  it("sets truncated=true when files exceed threshold", async () => {
    const { lockPath, outDir } = await mkLockDir({ "octo/repo": { ref: "abc" } });
    // Generate >250 files in one page so truncation kicks in.
    const bigFiles = Array.from({ length: 260 }, (_, i) => ({
      filename: `src/f${i}.ts`,
      status: "modified",
      additions: 1,
      deletions: 1,
      changes: 2,
    }));
    const { server, baseUrl } = await startServer((req, res) => {
      res.setHeader("content-type", "application/json");
      if (req.url === "/repos/octo/repo") return void res.end(JSON.stringify({ default_branch: "main" }));
      if (req.url?.startsWith("/repos/octo/repo/commits/main")) return void res.end(JSON.stringify({ sha: "h" }));
      if (req.url?.includes("/compare/")) {
        return void res.end(JSON.stringify({ files: bigFiles }));
      }
      res.statusCode = 404; res.end("{}");
    });
    activeServer = server;

    const results = await _runAudit({ sourceLockPath: lockPath, outputDir: outDir, apiBase: baseUrl });
    expect(results[0]!.truncated).toBe(true);
    expect(results[0]!.filesChanged).toBe(260);

    // Report should NOT contain per-file patches (we only emit summary lines).
    const audits = await readdir(outDir);
    const reportPath = join(outDir, audits.find((f) => f.endsWith(".md"))!);
    const md = await readFile(reportPath, "utf8");
    expect(md).toContain("truncated: true");
    expect(md).not.toContain("@@"); // no diff hunks leaked
  });
});
