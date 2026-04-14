/**
 * Share Local Extension
 *
 * Exports the session to HTML and opens it in your browser (Chrome) or provides the local path.
 *
 * Usage:
 *   /share-local          - Export and open in Chrome
 *   /share-local --path   - Show path only (don't open)
 *   /share-local --copy   - Copy the HTML file path to clipboard
 *
 * Requires:
 *   - Google Chrome installed (for --open flag)
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { spawn } from "node:child_process";
import { existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";

interface ShareLocalOptions {
	open?: boolean;
	pathOnly?: boolean;
	copy?: boolean;
}

function getChromePath(): string | null {
	const macPaths = [
		"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
		"/Applications/Chromium.app/Contents/MacOS/Chromium",
		"/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary",
	];
	const linuxPaths = [
		"/usr/bin/google-chrome",
		"/usr/bin/google-chrome-stable",
		"/usr/bin/chromium",
		"/usr/bin/chromium-browser",
		"/snap/bin/chromium",
	];
	const windowsPaths = [
		"C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
		"C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
		`${process.env.LOCALAPPDATA}\\Google\\Chrome\\Application\\chrome.exe`,
	];

	const platform = process.platform;
	const paths = platform === "darwin" ? macPaths : platform === "win32" ? windowsPaths : linuxPaths;

	for (const chromePath of paths) {
		if (existsSync(chromePath)) {
			return chromePath;
		}
	}
	return null;
}

async function openInChrome(filePath: string): Promise<boolean> {
	const chromePath = getChromePath();
	if (!chromePath) return false;

	const platform = process.platform;
	if (platform === "darwin") {
		spawn("open", ["-a", "Google Chrome", filePath], { detached: true });
	} else if (platform === "win32") {
		spawn("cmd", ["/c", "start", "", filePath], { detached: true, shell: true });
	} else {
		try {
			spawn("xdg-open", [filePath], { detached: true });
		} catch {
			spawn(chromePath, [filePath], { detached: true });
		}
	}

	setTimeout(() => {}, 500);
	return true;
}

function escapeHtml(text: string): string {
	return text
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&#039;");
}

function formatTimestamp(ts: number): string {
	return new Date(ts).toLocaleString();
}

function generateHtml(sessionName: string | null, entries: any[]): string {
	let html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(sessionName || "pi Session")}</title>
  <style>
    * { box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 900px; margin: 0 auto; padding: 20px; background: #1a1a2e; color: #eee; line-height: 1.6; }
    .header { text-align: center; margin-bottom: 30px; padding: 20px; background: #16213e; border-radius: 8px; }
    .header h1 { margin: 0 0 10px 0; color: #e94560; }
    .header .meta { color: #888; font-size: 0.9em; }
    .message { margin-bottom: 20px; padding: 15px; border-radius: 8px; }
    .message.user { background: #0f3460; border-left: 4px solid #4a90d9; }
    .message.assistant { background: #16213e; border-left: 4px solid #e94560; }
    .message.tool { background: #1a1a2e; border: 1px solid #333; border-left: 4px solid #4ade80; }
    .message.system { background: #2d2d44; border-left: 4px solid #fbbf24; font-style: italic; }
    .message-header { display: flex; justify-content: space-between; margin-bottom: 10px; color: #888; font-size: 0.85em; }
    .message-header .role { font-weight: bold; text-transform: uppercase; }
    .message-content { white-space: pre-wrap; word-break: break-word; }
    .message-content code { background: #0d0d1a; padding: 2px 6px; border-radius: 4px; font-family: 'Fira Code', 'Consolas', monospace; font-size: 0.9em; }
    pre { background: #0d0d1a; padding: 15px; border-radius: 6px; overflow-x: auto; }
    pre code { background: none; padding: 0; }
    .tool-name { color: #4ade80; font-weight: bold; }
    .timestamp { color: #666; }
    .error { color: #ef4444; }
    .success { color: #22c55e; }
    .footer { text-align: center; margin-top: 40px; padding: 20px; color: #666; font-size: 0.85em; }
  </style>
</head>
<body>
  <div class="header">
    <h1>${escapeHtml(sessionName || "pi Session Export")}</h1>
    <div class="meta">Exported: ${formatTimestamp(Date.now())} • ${entries.length} entries</div>
  </div>
  <div class="messages">
`;

	for (const entry of entries) {
		if (entry.type !== "message") continue;

		const msg = entry.message;
		const role = msg.role;
		const timestamp = entry.timestamp ? formatTimestamp(entry.timestamp) : "";

		if (role === "user") {
			const content = Array.isArray(msg.content)
				? msg.content.map((c: any) => (c.type === "text" ? c.text : `[${c.type}]`)).join("\n")
				: String(msg.content || "");

			html += `    <div class="message user">
      <div class="message-header">
        <span class="role">User</span>
        <span class="timestamp">${timestamp}</span>
      </div>
      <div class="message-content">${escapeHtml(content)}</div>
    </div>\n`;
		} else if (role === "assistant") {
			let content = "";
			for (const c of msg.content || []) {
				if (c.type === "text") {
					content += c.text + "\n";
				} else if (c.type === "tool_use") {
					content += `[Tool: ${c.name}]\n`;
				}
			}

			html += `    <div class="message assistant">
      <div class="message-header">
        <span class="role">Assistant</span>
        <span class="timestamp">${timestamp}</span>
      </div>
      <div class="message-content">${escapeHtml(content.trim())}</div>
    </div>\n`;
		} else if (role === "toolResult") {
			const toolName = entry.details?.toolName || "tool";
			const result = typeof msg.content === "string" ? msg.content : JSON.stringify(msg.content, null, 2);

			html += `    <div class="message tool">
      <div class="message-header">
        <span class="tool-name">${escapeHtml(toolName)}</span>
        <span class="timestamp">${timestamp}</span>
      </div>
      <div class="message-content"><pre><code>${escapeHtml(result)}</code></pre></div>
    </div>\n`;
		}
	}

	html += `  </div>
  <div class="footer">
    Generated by pi coding agent • <a href="https://github.com/badlogic/pi" style="color: #e94560;">GitHub</a>
  </div>
</body>
</html>`;

	return html;
}

function parseShareLocalArgs(text: string): ShareLocalOptions {
	const options: ShareLocalOptions = {};
	if (text.includes("--open") || text.includes("-o")) options.open = true;
	if (text.includes("--path") || text.includes("-p")) options.pathOnly = true;
	if (text.includes("--copy") || text.includes("-c")) options.copy = true;
	return options;
}

async function copyToClipboard(text: string): Promise<void> {
	return new Promise((resolve, reject) => {
		const platform = process.platform;
		let proc;

		if (platform === "darwin") {
			proc = spawn("pbcopy", { stdio: "pipe" });
		} else if (platform === "linux") {
			proc = spawn("xclip", ["-selection", "clipboard"], { stdio: "pipe" });
		} else {
			proc = spawn("cmd", ["/c", "echo", text, "|", "clip"], { shell: true });
			proc.on("close", () => resolve());
			return;
		}

		proc.stdin?.write(text);
		proc.stdin?.end();
		proc.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`Exit code ${code}`))));
		proc.on("error", reject);
	});
}

export default function (pi: ExtensionAPI) {
	pi.registerCommand("share-local", {
		description: "Export session to HTML and open in browser (--path for path only, --copy to copy path)",
		getArgumentCompletions: () => [
			{ value: "--open", label: "--open (open in Chrome)" },
			{ value: "--path", label: "--path (show path only)" },
			{ value: "--copy", label: "--copy (copy path to clipboard)" },
		],
		handler: async (args, ctx) => {
			const options = parseShareLocalArgs(args || "");
			const session = ctx.sessionManager;

			ctx.ui.setStatus("share-local", "Exporting session...");

			try {
				// Generate filename - use project directory (cwd) for easier access
				const sessionName = session.getSessionName();
				const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
				const safeName = sessionName
					? sessionName.replace(/[^a-zA-Z0-9-_]/g, "_").substring(0, 50)
					: "session";
				const filename = `pi-share-${safeName}-${timestamp}.html`;

				// Use project directory (cwd) or fall back to /tmp
				let outputDir = ctx.cwd;
				if (!existsSync(outputDir)) {
					outputDir = "/tmp";
				}

				const outputPath = join(outputDir, filename);

				// Get all entries from the session
				const entries = session.getEntries();

				// Generate and write HTML
				const html = generateHtml(sessionName, entries);
				writeFileSync(outputPath, html, "utf-8");

				// Handle options
				if (options.copy) {
					await copyToClipboard(outputPath);
					ctx.ui.notify("Path copied to clipboard!", "success");
					ctx.ui.setStatus("share-local", `Copied: ${outputPath}`);
				} else if (options.pathOnly) {
					ctx.ui.setStatus("share-local", `HTML: ${outputPath}`);
					ctx.ui.notify(`HTML exported to:\n${outputPath}`, "info");
				} else {
					const chromeAvailable = getChromePath() !== null;
					if (chromeAvailable) {
						await openInChrome(outputPath);
						ctx.ui.notify(`Opening in Chrome:\n${outputPath}`, "success");
						ctx.ui.setStatus("share-local", `Opened: ${outputPath}`);
					} else {
						ctx.ui.notify(
							`Chrome not found. HTML saved to:\n${outputPath}\n\nOpen it manually with any browser.`,
							"warning",
						);
						ctx.ui.setStatus("share-local", `HTML: ${outputPath}`);
					}
				}
			} catch (error) {
				ctx.ui.notify(`Export failed: ${(error as Error).message}`, "error");
				ctx.ui.setStatus("share-local", "");
			}
		},
	});
}
