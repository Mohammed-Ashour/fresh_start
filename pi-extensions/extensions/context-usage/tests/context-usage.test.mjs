// Run: ./pi-extensions/test.sh context-usage
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const { allocateCells, computeBreakdown, splitSystemPrompt, toolCategory, formatTokens } = await import("../breakdown.ts");

const prompt = [
	"You are pi. ".repeat(200),
	'<project_context>\nProject-specific instructions and guidelines:\n\n<project_instructions path="/home/u/.pi/agent/AGENTS.md">\n' + "rule ".repeat(400) + `\n</project_instructions>\n\n<project_instructions path="/repo/AGENTS.md">\nshort\n</project_instructions>\n</project_context>`,
	"<skills>\n<available_skills>\n  <skill>\n    <name>unslop</name>\n    <description>" + "cut ".repeat(50) + "</description>\n    <location>/s/unslop/SKILL.md</location>\n  </skill>\n  <skill>\n    <name>grill-me</name>\n    <description>ask</description>\n    <location>/s/g/SKILL.md</location>\n  </skill>\n</available_skills>\n</skills>",
	"<cwd>\n/repo\n</cwd>",
].join("\n\n");

test("system prompt splits into base, memory files, and skills", () => {
	const parts = splitSystemPrompt(prompt);
	assert.equal(parts.memoryFiles.length, 2);
	assert.equal(parts.memoryFiles[0].name, "/home/u/.pi/agent/AGENTS.md");
	assert.deepEqual(parts.skillsList.map((s) => s.name), ["unslop", "grill-me"]);
	assert.ok(parts.memory > 400 && parts.skills > 50 && parts.system > 500);
	assert.equal(parts.system + parts.memory + parts.skills, Math.ceil(prompt.length / 4));
});

test("tools are grouped by where they come from", () => {
	assert.equal(toolCategory({ name: "read", sourceInfo: { path: "builtin:read", source: "builtin" } }), "tools");
	assert.equal(toolCategory({ name: "lod_search", namespace: { name: "lod" }, sourceInfo: { path: "/x/pi-mcp-adapter/index.ts" } }), "mcp");
	assert.equal(toolCategory({ name: "ask_questions", sourceInfo: { path: "/u/.pi/agent/extensions/ask-questions.ts", source: "local" } }), "extensionTools");
});

const tools = [
	{ name: "read", description: "Read a file", parameters: { type: "object" }, sourceInfo: { path: "builtin:read" } },
	{ name: "ask_questions", description: "Ask ".repeat(100), parameters: {}, sourceInfo: { path: "/ext/ask.ts" } },
];
const messages = [{ role: "user", tokens: 1000 }, { role: "assistant", tokens: 3000 }, { role: "toolResult", tokens: 6000 }];

test("with a real total, the parts add up to it", () => {
	const b = computeBreakdown({ systemPrompt: prompt, tools, messages, usage: { tokens: 50_000, contextWindow: 200_000, percent: 25 }, reserveTokens: 16384 });
	assert.equal(b.used, 50_000);
	assert.equal(b.estimated, false);
	const sum = b.segments.reduce((n, s) => n + s.tokens, 0);
	assert.equal(sum, 200_000);
	const tool = b.segments.find((s) => s.category === "toolResults").tokens;
	const msg = b.segments.find((s) => s.category === "messages").tokens;
	assert.ok(Math.abs(tool / (tool + msg) - 0.6) < 0.01, "conversation split keeps the estimated proportions");
	assert.equal(b.segments.at(-1).category, "buffer");
	assert.deepEqual(b.messageCounts, { user: 1, assistant: 1, toolResults: 1 });
});

test("without a real total, it falls back to estimates", () => {
	const b = computeBreakdown({ systemPrompt: prompt, tools, messages, usage: { tokens: null, contextWindow: 200_000, percent: null }, reserveTokens: undefined });
	assert.equal(b.estimated, true);
	assert.ok(b.used > 10_000);
	assert.equal(b.segments.some((s) => s.category === "buffer"), false);
});

test("a new session shows the fixed cost as an estimate", () => {
	const b = computeBreakdown({ systemPrompt: prompt, tools, messages: [], usage: { tokens: 0, contextWindow: 200_000, percent: 0 }, reserveTokens: 16384 });
	assert.equal(b.estimated, true);
	assert.ok(b.used > 0);
});

test("cells always fill the grid and small parts stay visible", () => {
	const b = computeBreakdown({ systemPrompt: prompt, tools, messages, usage: { tokens: 50_000, contextWindow: 1_000_000, percent: 5 }, reserveTokens: 16384 });
	for (const n of [20, 100]) {
		const cells = allocateCells(b, n);
		assert.equal(cells.length, n);
		for (const s of b.segments) if (s.tokens > 0 && s.category !== "free") assert.ok(cells.includes(s.category), `${s.category} visible at ${n}`);
	}
	assert.equal(formatTokens(1500), "1.5K");
	assert.equal(formatTokens(62_400), "62K");
});

test("extension: footer bar and /context view", async () => {
	const packageDir = process.env.PI_PACKAGE_DIR ?? join(execFileSync("npm", ["root", "-g"], { encoding: "utf8" }).trim(), "@earendil-works/pi-coding-agent");
	const requirePi = createRequire(join(packageDir, "package.json"));
	const { createJiti } = requirePi("jiti");
	const jiti = createJiti(import.meta.url, { moduleCache: false, alias: {
		"@earendil-works/pi-coding-agent": join(packageDir, "dist/index.js"),
		"@earendil-works/pi-tui": join(packageDir, "node_modules/@earendil-works/pi-tui/dist/index.js"),
	} });
	const extension = (await jiti.import(fileURLToPath(new URL("../index.ts", import.meta.url)))).default;
	const handlers = {};
	const commands = {};
	extension({
		on: (e, h) => { handlers[e] = h; },
		registerCommand: (name, c) => { commands[name] = c; },
		getActiveTools: () => ["read", "ask_questions"],
		getAllTools: () => tools,
	});
	const statuses = [];
	const notes = [];
	const ctx = {
		cwd: "/tmp", mode: "print", model: { provider: "openai-codex", id: "gpt-x", contextWindow: 200_000 },
		getSystemPrompt: () => prompt,
		getContextUsage: () => ({ tokens: 150_000, contextWindow: 200_000, percent: 75 }),
		sessionManager: { getEntries: () => [], getLeafId: () => null },
		ui: { get theme() { throw new Error("no theme"); }, setStatus: (_k, v) => statuses.push(v), notify: (t) => notes.push(t) },
	};
	await handlers.session_start({}, ctx);
	assert.match(statuses.at(-1), /^ctx [█▒░]{20} 75% 150K\/200K · compact in \d+%  ●system ●chat$/);
	await commands.context.handler("", ctx);
	const view = notes.at(-1);
	assert.match(view, /Context Usage/);
	assert.match(view, /openai-codex\/gpt-x · 150K\/200K tokens \(75%\)/);
	for (const label of ["System prompt", "Built-in tools", "Extension tools", "Memory files", "Skills", "Messages", "Free space", "Auto-compact buffer"]) assert.match(view, new RegExp(label));
	assert.match(view, /AGENTS\.md/);
	assert.match(view, /unslop/);
});
