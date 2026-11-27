// Loads the real extension entry point with Pi's module loader and drives its tool_call hook.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";
import { fileURLToPath } from "node:url";

const packageDir = process.env.PI_PACKAGE_DIR ?? join(execFileSync("npm", ["root", "-g"], { encoding: "utf8" }).trim(), "@earendil-works/pi-coding-agent");
const { createJiti } = createRequire(join(packageDir, "package.json"))("jiti");
const jiti = createJiti(import.meta.url, { moduleCache: false, alias: { "@earendil-works/pi-coding-agent": join(packageDir, "dist/index.js") } });

const root = realpathSync(mkdtempSync(join(tmpdir(), "permission-gate-ext-")));
after(() => rmSync(root, { recursive: true, force: true }));
const agentDir = join(root, "agent");
const project = join(root, "project");
mkdirSync(join(project, ".pi"), { recursive: true });
mkdirSync(agentDir, { recursive: true });
execFileSync("git", ["init", "-q"], { cwd: project });
writeFileSync(join(project, "a.txt"), "tracked\n");
execFileSync("git", ["add", "."], { cwd: project });
execFileSync("git", ["-c", "user.email=t@t", "-c", "user.name=t", "commit", "-qm", "init"], { cwd: project });

async function load({ userConfig, projectConfig, trusted = true } = {}) {
	process.env.PI_CODING_AGENT_DIR = agentDir;
	rmSync(join(agentDir, "permissions.json"), { force: true });
	rmSync(join(project, ".pi", "permissions.json"), { force: true });
	if (userConfig) writeFileSync(join(agentDir, "permissions.json"), JSON.stringify(userConfig));
	if (projectConfig) writeFileSync(join(project, ".pi", "permissions.json"), JSON.stringify(projectConfig));
	const handlers = {};
	const commands = {};
	const pi = {
		on: (event, handler) => { handlers[event] = handler; },
		registerCommand: (name, options) => { commands[name] = options; },
		registerShortcut: () => {},
		registerTool: () => {},
	};
	const extension = (await jiti.import(fileURLToPath(new URL("../index.ts", import.meta.url)))).default;
	extension(pi);
	const ui = { prompts: [], notes: [], answer: "Deny", select: async (title, options) => { ui.prompts.push({ title, options }); return options.find((o) => o.startsWith(ui.answer)) ?? ui.answer; }, notify: (text) => ui.notes.push(text), setStatus: () => {} };
	const ctx = { cwd: project, hasUI: true, ui, isProjectTrusted: () => trusted };
	await handlers.session_start({}, ctx);
	const call = (toolName, input) => handlers.tool_call({ toolName, input, toolCallId: "1" }, ctx);
	return { call, ctx, ui, commands };
}

test("safe mode: normal work is silent, risky asks, catastrophic blocks", async () => {
	const { call, ui } = await load();
	assert.equal(await call("bash", { command: "npm test && rm -rf dist" }), undefined);
	assert.equal(await call("write", { path: "src/new.ts", content: "" }), undefined);
	assert.equal(ui.prompts.length, 0);

	const denied = await call("bash", { command: "git push --force" });
	assert.equal(denied.block, true);
	assert.match(denied.reason, /User denied/);
	assert.equal(ui.prompts.length, 1);

	const blocked = await call("bash", { command: "echo ok; rm -rf ~" });
	assert.equal(blocked.block, true);
	assert.equal(blocked.terminate, true);
	assert.equal((await call("read", { path: "~/.ssh/id_rsa" })).block, true);
});

test("allowing a rule for the session stops repeat prompts", async () => {
	const { call, ui } = await load();
	ui.answer = "Allow \"git-force-push\"";
	assert.equal(await call("bash", { command: "git push --force" }), undefined);
	assert.equal(await call("bash", { command: "git push -f origin other" }), undefined);
	assert.equal(ui.prompts.length, 1);
});

test("git reset --hard does not ask on a clean tree, asks on a dirty one", async () => {
	const { call, ui } = await load();
	assert.equal(await call("bash", { command: "git reset --hard" }), undefined);
	assert.equal(ui.prompts.length, 0);
	writeFileSync(join(project, "a.txt"), "changed\n");
	try {
		assert.equal((await call("bash", { command: "git reset --hard" })).block, true);
		assert.equal(ui.prompts.length, 1);
	} finally {
		execFileSync("git", ["checkout", "--", "a.txt"], { cwd: project });
	}
});

test("without a UI, risky actions are blocked with guidance instead of hanging", async () => {
	const { call, ctx } = await load();
	ctx.hasUI = false;
	const result = await call("bash", { command: "npm publish" });
	assert.equal(result.block, true);
	assert.match(result.reason, /no interactive UI/);
});

test("plan mode allows read-only commands and markdown only", async () => {
	const { call } = await load({ userConfig: { mode: "plan" } });
	assert.equal(await call("bash", { command: "git log --oneline | head" }), undefined);
	assert.equal((await call("bash", { command: "echo ok; npm install" })).block, true);
	assert.equal(await call("write", { path: "PLAN.md", content: "" }), undefined);
	assert.equal((await call("edit", { path: "src/a.ts" })).block, true);
});

test("default mode skips prompts for read-only commands", async () => {
	const { call, ui } = await load({ userConfig: { mode: "default" } });
	assert.equal(await call("bash", { command: "rg foo | head" }), undefined);
	assert.equal(ui.prompts.length, 0);
	await call("bash", { command: "npm install" });
	assert.equal(ui.prompts.length, 1);
});

test("legacy fullAuto mode maps to safe mode", async () => {
	const { call, ui } = await load({ userConfig: { mode: "fullAuto" } });
	assert.equal(await call("bash", { command: "npm install" }), undefined);
	assert.equal(ui.prompts.length, 0);
});

test("project config can tighten but not loosen, and needs trust", async () => {
	const loosen = await load({ projectConfig: { mode: "bypassPermissions", disabledRules: ["git-force-push"] } });
	await loosen.call("bash", { command: "git push --force" });
	assert.equal(loosen.ui.prompts.length, 1, "project cannot disable rules or lower the mode");

	const tighten = await load({ projectConfig: { mode: "plan" } });
	assert.equal((await tighten.call("bash", { command: "npm install" })).block, true);

	const untrusted = await load({ projectConfig: { mode: "plan" }, trusted: false });
	assert.equal(await untrusted.call("bash", { command: "npm install" }), undefined);
	assert.ok(untrusted.ui.notes.some((n) => /not trusted/.test(n)));
});

test("the agent cannot quietly edit the gate or project extensions", async () => {
	const { call, ui } = await load();
	assert.equal((await call("write", { path: ".pi/extensions/evil.ts", content: "" })).block, true);
	assert.equal(ui.prompts.length, 1);
});

test("sandbox: the bash tool override wraps commands", { skip: process.platform !== "darwin" && "macOS only" }, async () => {
	process.env.PI_CODING_AGENT_DIR = agentDir;
	writeFileSync(join(agentDir, "permissions.json"), JSON.stringify({ sandbox: true }));
	const tools = [];
	const handlers = {};
	const pi = { on: (e, h) => { handlers[e] = h; }, registerCommand: () => {}, registerShortcut: () => {}, registerTool: (t) => tools.push(t) };
	const extension = (await jiti.import(fileURLToPath(new URL("../index.ts", import.meta.url)))).default;
	extension(pi);
	rmSync(join(agentDir, "permissions.json"));
	assert.equal(tools.length, 1);
	assert.equal(tools[0].name, "bash");
	const ctx = { cwd: project, hasUI: true, isProjectTrusted: () => true, sessionManager: { getSessionId: () => "s", getSessionFile: () => undefined }, model: undefined, ui: { notify: () => {}, setStatus: () => {}, select: async () => undefined } };
	await handlers.session_start({}, ctx);
	const run = (command) => tools[0].execute("t1", { command }, undefined, () => {}, ctx).then((r) => r.content.map((c) => c.text).join(""), (e) => String(e?.message ?? e));
	assert.match(await run("echo inside > a.out && cat a.out"), /inside/);
	const probe = join(process.env.HOME, `.permission-gate-ext-probe-${process.pid}`);
	try {
		assert.match(await run(`echo x > '${probe}'`), /Operation not permitted|exit code/i);
	} finally {
		rmSync(probe, { force: true });
	}
});
