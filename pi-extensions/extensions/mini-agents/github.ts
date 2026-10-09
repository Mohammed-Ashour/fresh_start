import { execFile } from "node:child_process";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { promisify } from "node:util";

export interface PrSnapshot {
  url: string;
  title: string;
  body: string;
  baseSha: string;
  headSha: string;
  baseRepo: string;
  headRepo: string;
  diffPath: string;
}
interface PrMetadata extends Omit<PrSnapshot, "url" | "diffPath"> { files: number }
export type GithubRead = (args: string[], signal?: AbortSignal, cwd?: string) => Promise<string>;
const exec = promisify(execFile);
const repoPattern = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;

/** Invoke a fixed GitHub CLI read operation without an interactive prompt. */
async function githubRead(args: string[], signal?: AbortSignal, cwd?: string): Promise<string> {
  const { stdout } = await exec("gh", args, {
    cwd, signal, timeout: 30_000, maxBuffer: 8 * 1024 * 1024,
    env: { ...process.env, GH_PROMPT_DISABLED: "1", GH_PAGER: "cat" },
  });
  return stdout;
}

/** Resolve one explicit github.com PR URL, rejecting ambiguous targets. */
export function prTarget(task: string): { url: string; endpoint: string } | undefined {
  const urls = [...new Set(task.match(/https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+\/pull\/[1-9]\d*(?=$|[\s/?#)\],.;])/g) || [])];
  if (urls.length > 1) throw new Error("Review one PR URL at a time.");
  if (!urls.length) {
    if (/https:\/\/github\.com\/\S*\/pull\//.test(task)) throw new Error("Use a valid github.com PR URL.");
    return undefined;
  }
  const url = new URL(urls[0]);
  const [, owner, repo, , number] = url.pathname.split("/");
  return { url: urls[0], endpoint: `repos/${owner}/${repo}/pulls/${number}` };
}

/** Validate metadata from GitHub before using repository names or commit IDs. */
export function parsePrMetadata(text: string): PrMetadata {
  const values: unknown = JSON.parse(text);
  if (!Array.isArray(values) || values.length !== 7 ||
    typeof values[0] !== "string" || typeof values[1] !== "string" ||
    typeof values[2] !== "string" || !/^[a-f0-9]{40}$/.test(values[2]) ||
    typeof values[3] !== "string" || !/^[a-f0-9]{40}$/.test(values[3]) ||
    typeof values[4] !== "string" || !repoPattern.test(values[4]) ||
    typeof values[5] !== "string" || !repoPattern.test(values[5]) ||
    typeof values[6] !== "number" || !Number.isInteger(values[6]) || values[6] < 0) {
    throw new Error("GitHub returned unsupported PR metadata.");
  }
  return { title: values[0], body: values[1], baseSha: values[2], headSha: values[3],
    baseRepo: values[4], headRepo: values[5], files: values[6] };
}

/** Save a complete PR diff and reject revisions that changed while fetching. */
export async function readGithubPr(
  task: string, directory: string, cwd?: string, signal?: AbortSignal, read: GithubRead = githubRead,
): Promise<PrSnapshot | undefined> {
  let target = prTarget(task);
  const mention = task.match(/\b(?:current|this|my)\s+(?:PR|pull\s+request)\b|\bPR\s*#(\d+)/i);
  if (!target && mention) {
    const url = (await read(["pr", "view", ...(mention[1] ? [mention[1]] : []), "--json", "url", "--jq", ".url"], signal, cwd)).trim();
    target = prTarget(url);
    if (!target) throw new Error(`Could not resolve "${mention[0]}" to a GitHub PR from this directory.`);
  }
  if (!target) return undefined;
  const args = ["api", "--hostname", "github.com", "--method", "GET", target.endpoint,
    "--jq", '[.title,.body // "",.base.sha,.head.sha,.base.repo.full_name,.head.repo.full_name,.changed_files]'];
  const before = parsePrMetadata(await read(args, signal));
  const diff = await read(["pr", "diff", target.url, "--color", "never"], signal);
  const after = parsePrMetadata(await read(args, signal));
  if (before.headSha !== after.headSha || before.baseSha !== after.baseSha ||
    before.headRepo !== after.headRepo || before.baseRepo !== after.baseRepo || before.files !== after.files) {
    throw new Error("The PR changed while downloading. Run the review again for a consistent snapshot.");
  }
  const files = (diff.match(/^diff --git /gm) || []).length;
  if (files !== before.files) throw new Error(`Incomplete PR diff: expected ${before.files} files, received ${files}.`);
  signal?.throwIfAborted();
  const diffPath = join(directory, "pr.diff");
  writeFileSync(diffPath, diff, { mode: 0o600 });
  return { ...before, url: target.url, diffPath };
}

/** Read source at the pinned PR revision, with bounded line ranges and no remote writes. */
export async function readPrFile(
  pr: PrSnapshot, path: string, side: "head" | "base", offset: number, limit: number,
  signal?: AbortSignal, read: GithubRead = githubRead,
): Promise<string> {
  const parts = path.split("/");
  if (!path || parts.some((part) => !part || part === "." || part === "..") || /[\x00-\x1f\\]/.test(path)) {
    throw new Error("Use a repository-relative file path without traversal.");
  }
  if (!Number.isInteger(offset) || offset < 1 || !Number.isInteger(limit) || limit < 1 || limit > 2000) {
    throw new Error("Use an offset of at least 1 and a limit between 1 and 2000.");
  }
  const repo = side === "head" ? pr.headRepo : pr.baseRepo;
  const sha = side === "head" ? pr.headSha : pr.baseSha;
  const endpoint = `repos/${repo}/contents/${parts.map(encodeURIComponent).join("/")}?ref=${sha}`;
  const text = await read(["api", "--hostname", "github.com", "--method", "GET", endpoint,
    "--header", "Accept: application/vnd.github.raw+json"], signal);
  if (text.includes("\0")) throw new Error("Cannot review binary file contents as text.");
  const lines = text.split("\n");
  const selected = lines.slice(offset - 1, offset - 1 + limit);
  const content = selected.map((line, index) => `${offset + index}: ${line}`).join("\n");
  if (Buffer.byteLength(content) > 50 * 1024) throw new Error("File excerpt exceeds 50 KiB; request fewer lines.");
  return `${repo}@${sha}:${path}\nLines ${offset}-${offset + selected.length - 1} of ${lines.length}\n${content}`;
}
