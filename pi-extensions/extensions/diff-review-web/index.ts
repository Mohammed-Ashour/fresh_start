import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";

type DiffLineKind = "context" | "add" | "remove" | "range";

interface DiffLine {
	kind: DiffLineKind;
	content: string;
	oldLineNumber?: number;
	newLineNumber?: number;
}

interface DiffHunk {
	header: string;
	lines: DiffLine[];
}

interface FileDiff {
	oldPath: string;
	newPath: string;
	displayPath: string;
	hunks: DiffHunk[];
	additions: number;
	removals: number;
	binary: boolean;
}

interface ReviewComment {
	filePath: string;
	blockHeader: string;
	lineKind: DiffLineKind;
	oldLineNumber?: number;
	newLineNumber?: number;
	startOldLineNumber?: number;
	startNewLineNumber?: number;
	endOldLineNumber?: number;
	endNewLineNumber?: number;
	text: string;
}

interface ReviewRecord {
	id: string;
	sessionFile: string;
	cwd: string;
	diffLabel: string;
	files: FileDiff[];
	createdAt: string;
}

interface ReviewSubmitBody {
	comments: ReviewComment[];
}

function splitArgs(input: string): string[] {
	const tokens: string[] = [];
	let current = "";
	let quote: '"' | "'" | undefined;
	let escaped = false;

	for (const char of input) {
		if (escaped) {
			current += char;
			escaped = false;
			continue;
		}
		if (char === "\\") {
			escaped = true;
			continue;
		}
		if (quote) {
			if (char === quote) {
				quote = undefined;
			} else {
				current += char;
			}
			continue;
		}
		if (char === '"' || char === "'") {
			quote = char;
			continue;
		}
		if (/\s/.test(char)) {
			if (current.length > 0) {
				tokens.push(current);
				current = "";
			}
			continue;
		}
		current += char;
	}

	if (current.length > 0) {
		tokens.push(current);
	}
	return tokens;
}

function parseDiff(diffText: string): FileDiff[] {
	const files: FileDiff[] = [];
	const lines = diffText.split(/\r?\n/);
	let currentFile: FileDiff | undefined;
	let currentHunk: DiffHunk | undefined;
	let oldLine = 0;
	let newLine = 0;

	for (const line of lines) {
		if (line.startsWith("diff --git ")) {
			if (currentFile) {
				files.push(currentFile);
			}
			const match = line.match(/^diff --git a\/(.+) b\/(.+)$/);
			const oldPath = match?.[1] ?? "unknown";
			const newPath = match?.[2] ?? oldPath;
			currentFile = {
				oldPath,
				newPath,
				displayPath: newPath,
				hunks: [],
				additions: 0,
				removals: 0,
				binary: false,
			};
			currentHunk = undefined;
			continue;
		}
		if (!currentFile) {
			continue;
		}
		if (!currentHunk && (line.startsWith("Binary files ") || line.startsWith("GIT binary patch"))) {
			currentFile.binary = true;
			continue;
		}
		if (!currentHunk && line.startsWith("--- ")) {
			const oldPath = line.slice(4).trim();
			if (oldPath !== "/dev/null") {
				currentFile.oldPath = oldPath.replace(/^a\//, "");
			}
			continue;
		}
		if (!currentHunk && line.startsWith("+++ ")) {
			const newPath = line.slice(4).trim();
			if (newPath !== "/dev/null") {
				currentFile.newPath = newPath.replace(/^b\//, "");
				currentFile.displayPath = currentFile.newPath;
			}
			continue;
		}
		if (line.startsWith("@@")) {
			const hunkMatch = line.match(/^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@(.*)$/);
			oldLine = Number.parseInt(hunkMatch?.[1] ?? "0", 10);
			newLine = Number.parseInt(hunkMatch?.[3] ?? "0", 10);
			currentHunk = { header: line, lines: [] };
			currentFile.hunks.push(currentHunk);
			continue;
		}
		if (!currentHunk) {
			continue;
		}
		if (line.startsWith("+")) {
			currentHunk.lines.push({ kind: "add", content: line.slice(1), newLineNumber: newLine });
			currentFile.additions += 1;
			newLine += 1;
			continue;
		}
		if (line.startsWith("-")) {
			currentHunk.lines.push({ kind: "remove", content: line.slice(1), oldLineNumber: oldLine });
			currentFile.removals += 1;
			oldLine += 1;
			continue;
		}
		if (line.startsWith(" ")) {
			currentHunk.lines.push({
				kind: "context",
				content: line.slice(1),
				oldLineNumber: oldLine,
				newLineNumber: newLine,
			});
			oldLine += 1;
			newLine += 1;
			continue;
		}
		if (line.startsWith("\\ No newline at end of file")) {
			currentHunk.lines.push({ kind: "context", content: line, oldLineNumber: oldLine, newLineNumber: newLine });
		}
	}

	if (currentFile) {
		files.push(currentFile);
	}

	return files.filter((file) => file.hunks.length > 0 || file.binary);
}

function formatReviewLocation(comment: ReviewComment): string {
	if (comment.lineKind === "range") {
		const refs: string[] = [`file=${comment.filePath}`];
		if (comment.startNewLineNumber !== undefined && comment.endNewLineNumber !== undefined) {
			refs.push(`lines=${comment.startNewLineNumber}-${comment.endNewLineNumber}`);
		} else if (comment.startOldLineNumber !== undefined && comment.endOldLineNumber !== undefined) {
			refs.push(`old_lines=${comment.startOldLineNumber}-${comment.endOldLineNumber}`);
		}
		return refs.join(", ");
	}

	const refs: string[] = [`file=${comment.filePath}`];
	if (comment.newLineNumber !== undefined) {
		refs.push(`line=${comment.newLineNumber}`);
	} else if (comment.oldLineNumber !== undefined) {
		refs.push(`old_line=${comment.oldLineNumber}`);
	}
	return refs.join(", ");
}

function buildReviewDraft(comments: ReviewComment[]): string {
	const lines: string[] = ["Comments"];
	if (comments.length === 0) {
		lines.push("- No inline comments were captured.");
	} else {
		for (const [index, comment] of comments.entries()) {
			lines.push(`${index + 1}. ${formatReviewLocation(comment)}`);
			lines.push(`   block: ${comment.blockHeader}`);
			lines.push(`   comment: ${comment.text}`);
			lines.push("");
		}
	}
	lines.push("Please address or discuss each comment using the refs above.");
	return lines.join("\n");
}

function escapeHtml(value: string): string {
	return value
		.replaceAll("&", "&amp;")
		.replaceAll("<", "&lt;")
		.replaceAll(">", "&gt;")
		.replaceAll('"', "&quot;")
		.replaceAll("'", "&#39;");
}

const CLIENT_APP_JS = readFileSync(join(__dirname, "app.js"), "utf8");

function renderAppHtml(review: ReviewRecord): string {
	const payload = JSON.stringify(review).replaceAll("<", "\\u003c");
	return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>pi diff review</title>
  <style>
    :root {
      --bg: #0d1117;
      --panel: #161b22;
      --panel-2: #0f141a;
      --border: #30363d;
      --text: #c9d1d9;
      --muted: #8b949e;
      --accent: #58a6ff;
      --green-bg: #0f2d1f;
      --green: #aff5b4;
      --red-bg: #341a1d;
      --red: #ffdcd7;
      --blue-bg: #0c2d6b;
      --blue: #d2e4ff;
    }
    * { box-sizing: border-box; }
    body { margin: 0; font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: var(--bg); color: var(--text); }
    .app { display: grid; grid-template-columns: 280px 1fr; min-height: 100vh; }
    .sidebar { border-right: 1px solid var(--border); background: var(--panel-2); padding: 16px; overflow: auto; position: sticky; top: 0; height: 100vh; }
    .main { display: flex; flex-direction: column; min-width: 0; }
    .topbar { position: sticky; top: 0; z-index: 20; background: rgba(13, 17, 23, 0.96); border-bottom: 1px solid var(--border); padding: 12px 16px; display: flex; gap: 12px; align-items: center; justify-content: space-between; backdrop-filter: blur(10px); }
    .title { font-weight: 700; }
    .subtle { color: var(--muted); font-size: 12px; }
    .content { padding: 16px; }
    .file-link, .block-link { display: block; width: 100%; text-align: left; background: transparent; border: 1px solid transparent; color: var(--text); border-radius: 8px; padding: 8px 10px; cursor: pointer; margin-bottom: 8px; }
    .file-link:hover, .block-link:hover { border-color: var(--border); background: var(--panel); }
    .block-link { font-size: 12px; color: var(--muted); margin-left: 8px; }
    .file-card { border: 1px solid var(--border); border-radius: 12px; overflow: hidden; background: var(--panel); margin-bottom: 20px; }
    .file-header { padding: 12px 16px; border-bottom: 1px solid var(--border); display: flex; justify-content: space-between; gap: 16px; align-items: center; }
    .block-header { padding: 8px 16px; border-bottom: 1px solid var(--border); background: var(--blue-bg); color: var(--blue); font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12px; }
    .line { display: grid; grid-template-columns: 64px 64px 1fr 110px; gap: 0; border-bottom: 1px solid rgba(48,54,61,0.35); font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12px; align-items: start; }
    .line.context { background: var(--bg); }
    .line.add { background: var(--green-bg); color: var(--green); }
    .line.remove { background: var(--red-bg); color: var(--red); }
    .line.selected { outline: 1px solid var(--accent); outline-offset: -1px; }
    .num { color: var(--muted); padding: 8px 10px; border-right: 1px solid rgba(48,54,61,0.35); text-align: right; user-select: none; }
    .code { padding: 8px 10px; white-space: pre-wrap; word-break: break-word; }
    .actions { padding: 6px; display: flex; justify-content: flex-end; align-items: center; border-left: 1px solid rgba(48,54,61,0.35); }
    .comment-btn, .primary-btn, .secondary-btn { border: 1px solid var(--border); background: var(--panel-2); color: var(--text); border-radius: 8px; cursor: pointer; }
    .comment-btn { padding: 6px 8px; font-size: 12px; }
    .primary-btn { padding: 10px 14px; background: #238636; border-color: #238636; }
    .secondary-btn { padding: 10px 14px; }
    .comment-box { border-top: 1px solid var(--border); background: rgba(22,27,34,0.92); padding: 10px 12px 12px 12px; }
    textarea { width: 100%; min-height: 92px; resize: vertical; background: var(--bg); color: var(--text); border: 1px solid var(--border); border-radius: 8px; padding: 10px; font: inherit; }
    .comment-meta { color: var(--muted); font-size: 12px; margin-bottom: 8px; }
    .comment-actions { display: flex; gap: 8px; margin-top: 8px; }
    .pill { display: inline-flex; gap: 6px; align-items: center; border: 1px solid var(--border); border-radius: 999px; padding: 4px 10px; font-size: 12px; color: var(--muted); }
    .status { color: var(--muted); font-size: 13px; }
    .summary { margin-top: 16px; }
    .summary-item { border: 1px solid var(--border); border-radius: 8px; padding: 8px 10px; margin-bottom: 8px; background: var(--panel); font-size: 12px; }
    .empty { padding: 32px; border: 1px dashed var(--border); border-radius: 12px; color: var(--muted); text-align: center; }
    @media (max-width: 900px) {
      .app { grid-template-columns: 1fr; }
      .sidebar { position: relative; height: auto; border-right: none; border-bottom: 1px solid var(--border); }
      .line { grid-template-columns: 56px 56px 1fr; }
      .actions { grid-column: 1 / -1; border-left: 0; border-top: 1px solid rgba(48,54,61,0.35); justify-content: flex-start; }
    }
  </style>
</head>
<body>
  <div id="app"></div>
  <script>window.__PI_DIFF_REVIEW__ = ${payload};</script>
  <script src="/app.js"></script>
</body>
</html>`;
}

async function readRequestBody(request: IncomingMessage): Promise<string> {
	return new Promise((resolve, reject) => {
		let data = "";
		request.setEncoding("utf8");
		request.on("data", (chunk) => {
			data += chunk;
		});
		request.on("end", () => resolve(data));
		request.on("error", reject);
	});
}

function json(response: ServerResponse, statusCode: number, payload: unknown): void {
	response.writeHead(statusCode, { "Content-Type": "application/json; charset=utf-8" });
	response.end(JSON.stringify(payload));
}

function html(response: ServerResponse, statusCode: number, content: string): void {
	response.writeHead(statusCode, { "Content-Type": "text/html; charset=utf-8" });
	response.end(content);
}

function openBrowser(url: string): void {
	if (process.platform === "darwin") {
		spawn("open", [url], { detached: true, stdio: "ignore" }).unref();
		return;
	}
	if (process.platform === "win32") {
		spawn("cmd", ["/c", "start", "", url], { detached: true, stdio: "ignore" }).unref();
		return;
	}
	spawn("xdg-open", [url], { detached: true, stdio: "ignore" }).unref();
}

export default function diffReviewWebExtension(pi: ExtensionAPI) {
	let activeCtx: ExtensionContext | undefined;
	let activeSessionFile = "ephemeral";
	let server: Server | undefined;
	let port: number | undefined;
	const reviews = new Map<string, ReviewRecord>();

	async function execGit(args: string[]): Promise<{ stdout: string; stderr: string; code: number }> {
		const result = await pi.exec("git", args, { timeout: 30_000 });
		return { stdout: result.stdout, stderr: result.stderr, code: result.code };
	}

	async function ensureServer(): Promise<number> {
		if (server && port) {
			return port;
		}

		server = createServer(async (request, response) => {
			const url = new URL(request.url ?? "/", "http://127.0.0.1");
			const match = url.pathname.match(/^\/review\/([^/]+)$/);
			const completeMatch = url.pathname.match(/^\/api\/review\/([^/]+)\/complete$/);

			if (request.method === "GET" && url.pathname === "/app.js") {
				response.writeHead(200, { "Content-Type": "application/javascript; charset=utf-8" });
				response.end(CLIENT_APP_JS);
				return;
			}

			if (request.method === "GET" && match) {
				const review = reviews.get(match[1] ?? "");
				if (!review) {
					html(response, 404, "<h1>Review not found</h1>");
					return;
				}
				html(response, 200, renderAppHtml(review));
				return;
			}

			if (request.method === "POST" && completeMatch) {
				const review = reviews.get(completeMatch[1] ?? "");
				if (!review) {
					json(response, 404, { error: "Review not found" });
					return;
				}
				if (!activeCtx || activeSessionFile !== review.sessionFile) {
					json(response, 409, { error: "The originating pi session is no longer active. Start the review again from pi." });
					return;
				}
				const rawBody = await readRequestBody(request);
				const body = JSON.parse(rawBody || "{}") as ReviewSubmitBody;
				const draft = buildReviewDraft(body.comments ?? []);
				activeCtx.ui.setEditorText(draft);
				activeCtx.ui.notify("Web review loaded into the pi editor. Press Enter there to send it.", "info");
				reviews.delete(review.id);
				json(response, 200, { message: "Review loaded into pi. Go back to pi and press Enter." });
				return;
			}

			json(response, 404, { error: "Not found" });
		});

		await new Promise<void>((resolve) => {
			server!.listen(0, "127.0.0.1", () => resolve());
		});
		port = (server.address() as AddressInfo).port;
		return port;
	}

	function resetServer(): void {
		for (const reviewId of reviews.keys()) {
			reviews.delete(reviewId);
		}
		if (server) {
			server.close();
			server = undefined;
			port = undefined;
		}
	}

	pi.on("session_start", async (_event, ctx) => {
		activeCtx = ctx;
		activeSessionFile = ctx.sessionManager.getSessionFile?.() ?? "ephemeral";
	});

	pi.on("session_shutdown", async () => {
		activeCtx = undefined;
		activeSessionFile = "ephemeral";
		resetServer();
	});

	pi.registerCommand("diff-review-web", {
		description: "Open a browser-based GitHub-style diff review UI and send comments back to pi",
		handler: async (args, ctx) => {
			if (ctx.mode !== "tui") {
				ctx.ui.notify("/diff-review-web requires TUI mode", "error");
				return;
			}
			const userArgs = args?.trim() ?? "";
			const diffArgs = splitArgs(userArgs);
			const insideRepo = await execGit(["rev-parse", "--is-inside-work-tree"]);
			if (insideRepo.code !== 0 || insideRepo.stdout.trim() !== "true") {
				ctx.ui.notify("/diff-review-web must run inside a git repository", "error");
				return;
			}
			const diffResult = await execGit(["diff", "--no-ext-diff", "--find-renames", "--unified=3", "--relative", ...diffArgs]);
			if (diffResult.code !== 0) {
				ctx.ui.notify(diffResult.stderr.trim() || "git diff failed", "error");
				return;
			}
			if (!diffResult.stdout.trim()) {
				ctx.ui.notify("No diff found for review", "info");
				return;
			}
			const files = parseDiff(diffResult.stdout);
			if (files.length === 0) {
				ctx.ui.notify("No text blocks found to review", "warning");
				return;
			}
			activeCtx = ctx;
			activeSessionFile = ctx.sessionManager.getSessionFile?.() ?? "ephemeral";
			const review: ReviewRecord = {
				id: randomUUID(),
				sessionFile: activeSessionFile,
				cwd: ctx.cwd,
				diffLabel: userArgs || "working tree diff",
				files,
				createdAt: new Date().toISOString(),
			};
			reviews.set(review.id, review);
			const activePort = await ensureServer();
			const url = `http://127.0.0.1:${activePort}/review/${review.id}`;
			openBrowser(url);
			ctx.ui.notify(`Opened web diff review at ${url}`, "info");
		},
	});

	pi.registerCommand("diff-review-web-stop", {
		description: "Stop the browser diff review server",
		handler: async (_args, ctx) => {
			resetServer();
			ctx.ui.notify("Stopped diff review web server", "info");
		},
	});
}
