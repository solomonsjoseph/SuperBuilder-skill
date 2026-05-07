// Source-update auditor. Drives the GitHub compare API for each pinned
// upstream source, classifies the diff, and writes a markdown report.
//
// API surface confirmed against:
//   https://docs.github.com/en/rest/commits/commits#compare-two-commits
//   https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api
//   https://docs.github.com/en/rest/using-the-rest-api/best-practices-for-using-the-rest-api
//
// Notes on the spec vs reality:
//   - `per_page` max for the compare endpoint is 100 (not 250). The "250"
//     figure comes from compare's commits cap; the files list has no
//     documented per-response cap. We loop on `Link: rel="next"` until done.
//   - Our truncation thresholds (>250 files or additions+deletions > 10000)
//     are policy, not API limits — they bound the size of the audit
//     report and the human review surface.

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";

// Public API ----------------------------------------------------------------

export interface AuditOptions {
  sourceLockPath: string;
  outputDir: string;
  githubToken?: string;
}

export type Classification =
  | "irrelevant"
  | "capability"
  | "behavior"
  | "security"
  | "breaking"
  | "unknown";

export interface SourceAuditResult {
  source: string;
  pinned: string;
  latest: string;
  classification: Classification;
  filesChanged: number;
  truncated: boolean;
  compareUrl: string;
  // Non-breaking extension over the brief's interface: per-source errors
  // surface here so the CLI can write a partial report and still exit 1.
  error?: string;
}

export async function runAudit(opts: AuditOptions): Promise<SourceAuditResult[]> {
  return _runAudit({ ...opts, apiBase: "https://api.github.com" });
}

// Internal --------------------------------------------------------------------

interface InternalOptions extends AuditOptions {
  apiBase: string; // injected for tests; defaults to api.github.com
  // Sleep override — tests pass a fast no-op so backoff doesn't actually wait.
  sleep?: (ms: number) => Promise<void>;
}

interface SourceLockEntry {
  ref: string;
  lastChecked: string | null;
  mappedComponents?: string[];
}

interface SourceLock {
  sources: Record<string, SourceLockEntry>;
}

interface CompareFile {
  sha?: string;
  filename: string;
  status: "added" | "removed" | "modified" | "renamed" | "copied" | "changed" | "unchanged";
  additions: number;
  deletions: number;
  changes: number;
  previous_filename?: string;
}

interface ComparePage {
  // Compare returns `total_commits`, `commits[]`, `files[]` and pagination
  // splits across `files[]`. We only need files for classification.
  files?: CompareFile[];
  total_commits?: number;
  status?: string; // ahead | behind | identical | diverged
}

interface RepoInfo {
  default_branch: string;
}

interface CommitInfo {
  sha: string;
}

const TRUNCATE_FILES = 250;
const TRUNCATE_CHANGE_LINES = 10_000;

// Classification regexes — kept as module constants and documented in the
// audit report so a reader can reproduce the heuristic.
const SECURITY_RE = /(?:^|\/)(security|deny|hooks|policy)(?:\/|\.|$)/i;
const DOC_OR_META_RE =
  /^(?:docs?|examples?|website|site)\/|(?:^|\/)(?:README|CHANGELOG|LICENSE|CONTRIBUTING|CODE_OF_CONDUCT)(?:\.[a-z]+)?$|^\.github\/|\.md$|\.mdx$|\.rst$|\.txt$/i;
const TEST_RE = /(?:^|\/)(?:tests?|__tests__|spec|specs|e2e)\/|\.test\.[a-z]+$|\.spec\.[a-z]+$/i;
const CI_RE = /^\.github\/workflows\//i;

export async function _runAudit(opts: InternalOptions): Promise<SourceAuditResult[]> {
  const lockRaw = await readFile(opts.sourceLockPath, "utf8");
  let lock: SourceLock;
  try {
    lock = JSON.parse(lockRaw) as SourceLock;
  } catch (e) {
    throw new Error(`Invalid JSON in ${opts.sourceLockPath}: ${(e as Error).message}`);
  }
  if (!lock.sources || typeof lock.sources !== "object") {
    throw new Error(`source-lock.json missing 'sources' object: ${opts.sourceLockPath}`);
  }

  const token =
    opts.githubToken ?? process.env.GH_TOKEN ?? process.env.GITHUB_TOKEN ?? null;
  if (!token) {
    console.warn(
      "source-audit: no GH_TOKEN/GITHUB_TOKEN — running anonymously (60 req/hr limit).",
    );
  }

  const sleep = opts.sleep ?? defaultSleep;
  const results: SourceAuditResult[] = [];

  for (const [source, entry] of Object.entries(lock.sources)) {
    const compareUrl = makeCompareWebUrl(source, entry.ref, "HEAD");
    try {
      const result = await auditOne(source, entry, opts.apiBase, token, sleep);
      results.push(result);
    } catch (e) {
      results.push({
        source,
        pinned: entry.ref,
        latest: "",
        classification: "unknown",
        filesChanged: 0,
        truncated: false,
        compareUrl,
        error: (e as Error).message,
      });
    }
  }

  await writeReport(results, opts.outputDir);
  return results;
}

async function auditOne(
  source: string,
  entry: SourceLockEntry,
  apiBase: string,
  token: string | null,
  sleep: (ms: number) => Promise<void>,
): Promise<SourceAuditResult> {
  const [owner, repo] = parseSource(source);
  const pinned = entry.ref;
  if (!pinned || pinned.startsWith("TBD")) {
    throw new Error(
      `pinned ref is unset (${pinned}); run /superbuilder:supersources after editing source-lock.json`,
    );
  }

  // 1. Default branch via /repos/:owner/:repo
  const repoInfo = await ghJson<RepoInfo>(
    `${apiBase}/repos/${owner}/${repo}`,
    token,
    sleep,
  );
  const headBranch = repoInfo.default_branch;

  // 2. Latest commit on default branch via /repos/:owner/:repo/commits/{branch}
  const head = await ghJson<CommitInfo>(
    `${apiBase}/repos/${owner}/${repo}/commits/${encodeURIComponent(headBranch)}`,
    token,
    sleep,
  );
  const latest = head.sha;

  // 3. Walk compare pages. per_page max is 100 per the docs.
  const files: CompareFile[] = [];
  let truncated = false;
  let url: string | null =
    `${apiBase}/repos/${owner}/${repo}/compare/${encodeURIComponent(pinned)}...${encodeURIComponent(latest)}?per_page=100&page=1`;
  while (url) {
    const page: { body: ComparePage; nextUrl: string | null } = await ghJsonPaged<ComparePage>(url, token, sleep);
    if (page.body.files?.length) files.push(...page.body.files);
    // Stop accumulating per-file content once we cross the truncation threshold;
    // we still loop pages so filesChanged is accurate, but per-file patches
    // are ignored downstream (we never emit patches anyway).
    if (shouldTruncate(files)) truncated = true;
    url = page.nextUrl;
  }

  return {
    source,
    pinned,
    latest,
    classification: classify(files),
    filesChanged: files.length,
    truncated,
    compareUrl: makeCompareWebUrl(source, pinned, latest),
  };
}

function shouldTruncate(files: CompareFile[]): boolean {
  if (files.length > TRUNCATE_FILES) return true;
  let lines = 0;
  for (const f of files) lines += (f.additions ?? 0) + (f.deletions ?? 0);
  return lines > TRUNCATE_CHANGE_LINES;
}

// Heuristic classification. Order matters — first match wins.
//   1. security  — any path matches /(security|deny|hooks|policy)/i
//   2. breaking  — package.json touched AND any file removed
//   3. irrelevant — every file is docs/CI/test
//   4. capability — every file status === "added"
//   5. behavior  — anything else with non-doc/non-test changes
//   6. unknown   — fallback (e.g. empty diff)
export function classify(files: CompareFile[]): Classification {
  if (files.length === 0) return "irrelevant";

  for (const f of files) {
    if (SECURITY_RE.test(f.filename)) return "security";
  }

  const touchesPackageJson = files.some(
    (f) => f.filename === "package.json" || /(?:^|\/)package\.json$/.test(f.filename),
  );
  const anyRemoved = files.some((f) => f.status === "removed");
  if (touchesPackageJson && anyRemoved) return "breaking";

  const allDocsOrMeta = files.every(
    (f) => DOC_OR_META_RE.test(f.filename) || TEST_RE.test(f.filename) || CI_RE.test(f.filename),
  );
  if (allDocsOrMeta) return "irrelevant";

  const allAdded = files.every((f) => f.status === "added");
  if (allAdded) return "capability";

  const anyNonDocNonTest = files.some(
    (f) =>
      !DOC_OR_META_RE.test(f.filename) &&
      !TEST_RE.test(f.filename) &&
      !CI_RE.test(f.filename),
  );
  if (anyNonDocNonTest) return "behavior";

  return "unknown";
}

// HTTP layer --------------------------------------------------------------

const RETRY_BASE_MS = 1000;
const RETRY_FACTOR = 2;
const RETRY_CAP_MS = 30_000;
const RETRY_MAX_ATTEMPTS = 5;

function defaultSleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function ghFetch(
  url: string,
  token: string | null,
  sleep: (ms: number) => Promise<void>,
): Promise<Response> {
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "superbuilder-source-audit",
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  let attempt = 0;
  // Exponential backoff for 403/429/5xx with rate-limit-aware sleeping.
  // Per docs:
  //   https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api
  //   - 403/429 with retry-after  -> wait that many seconds
  //   - 403/429 with x-ratelimit-remaining=0 -> wait until x-ratelimit-reset
  //   - else exponential backoff, ceiling 30s, 5 attempts.
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const res = await fetch(url, { headers });
    if (res.status !== 403 && res.status !== 429 && res.status < 500) {
      // Pre-emptive throttle when remaining is low (well-behaved client).
      const remaining = parseInt(res.headers.get("x-ratelimit-remaining") ?? "", 10);
      const reset = parseInt(res.headers.get("x-ratelimit-reset") ?? "", 10);
      if (
        Number.isFinite(remaining) &&
        remaining < 5 &&
        Number.isFinite(reset)
      ) {
        const waitSec = Math.max(0, reset - Math.floor(Date.now() / 1000));
        if (waitSec > 0) await sleep(waitSec * 1000);
      }
      return res;
    }

    attempt += 1;
    if (attempt > RETRY_MAX_ATTEMPTS) {
      throw new Error(
        `GitHub API ${res.status} after ${RETRY_MAX_ATTEMPTS} retries: ${url}`,
      );
    }
    const waitMs = computeBackoffMs(res, attempt);
    await sleep(waitMs);
  }
}

export function computeBackoffMs(res: Response, attempt: number): number {
  const retryAfter = parseInt(res.headers.get("retry-after") ?? "", 10);
  if (Number.isFinite(retryAfter) && retryAfter > 0) {
    return Math.min(retryAfter * 1000, RETRY_CAP_MS);
  }
  const remaining = parseInt(res.headers.get("x-ratelimit-remaining") ?? "", 10);
  const reset = parseInt(res.headers.get("x-ratelimit-reset") ?? "", 10);
  if (remaining === 0 && Number.isFinite(reset)) {
    const waitSec = Math.max(1, reset - Math.floor(Date.now() / 1000));
    return Math.min(waitSec * 1000, RETRY_CAP_MS);
  }
  // Exponential: 1s, 2s, 4s, 8s, 16s capped at 30s.
  return Math.min(RETRY_BASE_MS * Math.pow(RETRY_FACTOR, attempt - 1), RETRY_CAP_MS);
}

async function ghJson<T>(
  url: string,
  token: string | null,
  sleep: (ms: number) => Promise<void>,
): Promise<T> {
  const res = await ghFetch(url, token, sleep);
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`GET ${url} -> ${res.status}: ${body.slice(0, 200)}`);
  }
  return (await res.json()) as T;
}

async function ghJsonPaged<T>(
  url: string,
  token: string | null,
  sleep: (ms: number) => Promise<void>,
): Promise<{ body: T; nextUrl: string | null }> {
  const res = await ghFetch(url, token, sleep);
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`GET ${url} -> ${res.status}: ${body.slice(0, 200)}`);
  }
  const body = (await res.json()) as T;
  const nextUrl = parseLinkNext(res.headers.get("link"));
  return { body, nextUrl };
}

export function parseLinkNext(linkHeader: string | null): string | null {
  if (!linkHeader) return null;
  // Header form: `<url>; rel="next", <url>; rel="last"`
  for (const part of linkHeader.split(",")) {
    const m = part.trim().match(/^<([^>]+)>\s*;\s*rel="?next"?$/);
    if (m) return m[1] ?? null;
  }
  return null;
}

// Helpers -----------------------------------------------------------------

function parseSource(source: string): [string, string] {
  const [owner, repo] = source.split("/");
  if (!owner || !repo) {
    throw new Error(`Invalid source name '${source}'; expected owner/repo`);
  }
  return [owner, repo];
}

function makeCompareWebUrl(source: string, base: string, head: string): string {
  // Human-readable compare URL — points at github.com, not the API.
  return `https://github.com/${source}/compare/${base}...${head}`;
}

async function writeReport(
  results: SourceAuditResult[],
  outputDir: string,
): Promise<void> {
  await mkdir(outputDir, { recursive: true });
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const path = join(outputDir, `AUDIT-${ts}.md`);
  const md = renderReport(results, ts);
  await writeFile(path, md, "utf8");
}

export function renderReport(results: SourceAuditResult[], ts: string): string {
  const lines: string[] = [];
  lines.push(`# Source audit — ${ts}`);
  lines.push("");
  const counts: Record<Classification, number> = {
    irrelevant: 0,
    capability: 0,
    behavior: 0,
    security: 0,
    breaking: 0,
    unknown: 0,
  };
  for (const r of results) counts[r.classification] += 1;
  lines.push("## Summary");
  lines.push("");
  lines.push(`Sources audited: ${results.length}`);
  for (const k of Object.keys(counts) as Classification[]) {
    lines.push(`- ${k}: ${counts[k]}`);
  }
  const errored = results.filter((r) => r.error).length;
  if (errored > 0) lines.push(`- errored: ${errored}`);
  lines.push("");
  lines.push("## Classification heuristic");
  lines.push("");
  lines.push("Order (first match wins): security -> breaking -> irrelevant -> capability -> behavior -> unknown.");
  lines.push("- security: any path matches /(security|deny|hooks|policy)/i");
  lines.push("- breaking: package.json present AND any 'removed' file");
  lines.push("- irrelevant: every file is docs/CI/test (regex)");
  lines.push("- capability: every file status === 'added'");
  lines.push("- behavior: any non-doc/non-test/non-CI file changed");
  lines.push("- unknown: fallback");
  lines.push("");
  for (const r of results) {
    lines.push(`## ${r.source}`);
    lines.push("");
    lines.push(`- pinned: \`${r.pinned}\``);
    lines.push(`- latest: \`${r.latest || "(unknown)"}\``);
    lines.push(`- classification: **${r.classification}**`);
    lines.push(`- files changed: ${r.filesChanged}`);
    lines.push(`- truncated: ${r.truncated}`);
    lines.push(`- compare: ${r.compareUrl}`);
    if (r.error) lines.push(`- error: ${r.error}`);
    lines.push("");
  }
  return lines.join("\n");
}
