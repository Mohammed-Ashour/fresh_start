/**
 * Permission Gate
 *
 * Modes:
 *   - plan:              Read-only commands; write/edit only .md files
 *   - default:           Confirm every write, edit, and non-read-only bash command
 *   - acceptEdits:       Allow write/edit, confirm non-read-only bash commands
 *   - safeMode:          Allow normal work, ask only for risky actions (recommended)
 *   - bypassPermissions: Never ask
 *
 * In every mode, catastrophic commands (deleting /, ~, system folders, formatting
 * disks, ...) and secret paths (~/.ssh, ~/.aws, auth files, ...) are blocked.
 * `fullAuto` from older configs maps to safeMode.
 *
 * Config: ~/.pi/agent/permissions.json (see permissions.example.json). A trusted
 * project may add .pi/permissions.json, which can only tighten the policy.
 *
 * Commands: /permissions [mode], /permissions-explain <command>,
 *           /permissions-settings, /permissions:status, /sandbox [on|off]
 * Shortcut: Ctrl+Shift+P cycles plan → default → acceptEdits → safeMode
 */

import { execFile, execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	createBashToolDefinition,
	getAgentDir,
	type ExtensionAPI,
	type ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import {
	classifyCommand,
	classifyRead,
	classifyWrite,
	createPolicy,
	describeFindings,
	displayPath,
	type Finding,
	type PatternRule,
	type Policy,
	type Verdict,
} from "./policy.ts";
import { buildSandboxProfile, sandboxAvailable, sandboxCommand } from "./sandbox.ts";

// --- Types and constants ---

type PermissionMode = "plan" | "default" | "acceptEdits" | "safeMode" | "bypassPermissions";

interface FileConfig {
	mode?: string;
	sandbox?: boolean;
	extraSecretPaths?: string[];
	extraWriteProtectedPaths?: string[];
	extraReadOnlyCommands?: string[];
	askPatterns?: PatternRule[];
	blockPatterns?: PatternRule[];
	disabledRules?: string[];
}

interface Config {
	mode: PermissionMode;
	sandbox: boolean;
	extraSecretPaths: string[];
	extraWriteProtectedPaths: string[];
	extraReadOnlyCommands: string[];
	askPatterns: PatternRule[];
	blockPatterns: PatternRule[];
	disabledRules: string[];
	sources: string[];
	warnings: string[];
}

const MODES: { id: PermissionMode; label: string; description: string; icon: string }[] = [
	{ id: "plan", label: "Plan", description: "Read-only commands; write/edit only .md files", icon: "◻" },
	{ id: "default", label: "Default", description: "Confirm every write, edit, and non-read-only command", icon: "⏵" },
	{ id: "acceptEdits", label: "Accept Edits", description: "Allow write/edit, confirm non-read-only commands", icon: "⏵⏵" },
	{ id: "safeMode", label: "Safe Mode", description: "Allow normal work, ask only for risky actions", icon: "◈" },
	{ id: "bypassPermissions", label: "Bypass", description: "Never ask; still block catastrophic and secret access", icon: "⏵⏵⏵⏵" },
];

/** Lower is stricter. A project config may only move the mode down this list. */
const STRICTNESS: Record<PermissionMode, number> = { plan: 0, default: 1, acceptEdits: 2, safeMode: 3, bypassPermissions: 4 };

const READ_TOOLS = new Set(["read", "grep", "find", "ls"]);
const WRITE_TOOLS = new Set(["write", "edit"]);

// --- Config ---

function parseMode(value: unknown): PermissionMode | undefined {
	if (value === "fullAuto") return "safeMode";
	return MODES.find((m) => m.id === value)?.id;
}

function readJson(path: string): FileConfig | undefined {
	let text: string;
	try {
		text = readFileSync(path, "utf-8");
	} catch {
		return undefined;
	}
	return JSON.parse(text) as FileConfig;
}

function strings(value: unknown): string[] {
	return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
}

function rules(value: unknown): PatternRule[] {
	return Array.isArray(value)
		? value.filter((r): r is PatternRule => !!r && typeof r.pattern === "string" && typeof r.description === "string")
		: [];
}

function loadUserConfig(): Config {
	const config: Config = {
		mode: "safeMode",
		sandbox: false,
		extraSecretPaths: [],
		extraWriteProtectedPaths: [],
		extraReadOnlyCommands: [],
		askPatterns: [],
		blockPatterns: [],
		disabledRules: [],
		sources: [],
		warnings: [],
	};
	const agentDir = getAgentDir();
	// The legacy location only contributes keys the new format understands.
	for (const path of [join(agentDir, "permissions.json"), join(agentDir, "extensions/permissions.json")]) {
		let file: FileConfig | undefined;
		try {
			file = readJson(path);
		} catch (error) {
			config.warnings.push(`Ignoring invalid ${path}: ${(error as Error).message}`);
			continue;
		}
		if (!file) continue;
		config.sources.push(path);
		const mode = parseMode(file.mode);
		if (file.mode !== undefined && !mode) config.warnings.push(`Unknown mode "${file.mode}" in ${path}`);
		if (mode) config.mode = mode;
		if (typeof file.sandbox === "boolean") config.sandbox = file.sandbox;
		config.extraSecretPaths.push(...strings(file.extraSecretPaths));
		config.extraWriteProtectedPaths.push(...strings(file.extraWriteProtectedPaths));
		config.extraReadOnlyCommands.push(...strings(file.extraReadOnlyCommands));
		config.askPatterns.push(...rules(file.askPatterns));
		config.blockPatterns.push(...rules(file.blockPatterns));
		config.disabledRules.push(...strings(file.disabledRules));
		break;
	}
	return config;
}

/** Merge a trusted project's config. It can add restrictions but never remove them. */
function withProjectConfig(base: Config, ctx: ExtensionContext): Config {
	const config: Config = {
		...base,
		extraSecretPaths: [...base.extraSecretPaths],
		extraWriteProtectedPaths: [...base.extraWriteProtectedPaths],
		askPatterns: [...base.askPatterns],
		blockPatterns: [...base.blockPatterns],
		sources: [...base.sources],
		warnings: [...base.warnings],
	};
	const candidates = [join(ctx.cwd, ".pi/permissions.json"), join(ctx.cwd, ".pi/extensions/permissions.json")];
	for (const path of candidates) {
		let file: FileConfig | undefined;
		try {
			file = readJson(path);
		} catch (error) {
			config.warnings.push(`Ignoring invalid ${path}: ${(error as Error).message}`);
			continue;
		}
		if (!file) continue;
		if (!ctx.isProjectTrusted()) {
			config.warnings.push(`Ignoring ${path}: project is not trusted`);
			break;
		}
		config.sources.push(`${path} (project, tighten-only)`);
		const mode = parseMode(file.mode);
		if (mode && STRICTNESS[mode] < STRICTNESS[config.mode]) config.mode = mode;
		if (file.sandbox === true) config.sandbox = true;
		config.extraSecretPaths.push(...strings(file.extraSecretPaths));
		config.extraWriteProtectedPaths.push(...strings(file.extraWriteProtectedPaths));
		config.askPatterns.push(...rules(file.askPatterns));
		config.blockPatterns.push(...rules(file.blockPatterns));
		break;
	}
	return config;
}

function gitTopLevel(cwd: string): string | undefined {
	try {
		return execFileSync("git", ["rev-parse", "--show-toplevel"], { cwd, timeout: 2000, encoding: "utf-8", stdio: ["ignore", "pipe", "ignore"] }).trim() || undefined;
	} catch {
		return undefined;
	}
}

/** True when the paths have uncommitted or untracked changes; undefined when unknown. */
function hasChanges(cwd: string, paths: string[]): Promise<boolean | undefined> {
	return new Promise((resolvePromise) => {
		const args = ["status", "--porcelain", ...(paths.length ? ["--", ...paths] : [])];
		execFile("git", args, { cwd, timeout: 3000 }, (error, stdout) => {
			resolvePromise(error ? undefined : stdout.trim().length > 0);
		});
	});
}

function readShellSettings(): { shellPath?: string; commandPrefix?: string } {
	try {
		const settings = JSON.parse(readFileSync(join(getAgentDir(), "settings.json"), "utf-8"));
		return {
			shellPath: typeof settings.shellPath === "string" ? settings.shellPath : undefined,
			commandPrefix: typeof settings.shellCommandPrefix === "string" ? settings.shellCommandPrefix : undefined,
		};
	} catch {
		return {};
	}
}

function truncate(text: string, max = 300): string {
	return text.length > max ? text.slice(0, max) + "…" : text;
}

// --- Extension ---

export default function permissionGate(pi: ExtensionAPI) {
	const userConfig = loadUserConfig();
	let config = userConfig;
	let mode: PermissionMode = config.mode;
	let policy: Policy | undefined;
	let policyCwd: string | undefined;
	let sandboxOn = false;
	let profilePath: string | undefined;

	const sessionRules = new Set<string>();
	const sessionCommands = new Set<string>();
	const sessionTools = new Set<string>();

	function resetSession() {
		sessionRules.clear();
		sessionCommands.clear();
		sessionTools.clear();
	}

	function buildPolicy(cwd: string): Policy {
		const top = gitTopLevel(cwd);
		policy = createPolicy({
			cwd,
			projectRoots: top ? [top] : [],
			extraSecretPaths: config.extraSecretPaths,
			extraWriteProtectedPaths: config.extraWriteProtectedPaths,
			extraReadOnlyCommands: config.extraReadOnlyCommands,
			askPatterns: config.askPatterns,
			blockPatterns: config.blockPatterns,
			disabledRules: config.disabledRules,
		});
		policyCwd = cwd;
		profilePath = undefined;
		for (const pattern of policy.invalidPatterns) config.warnings.push(`Invalid regex ignored: ${pattern}`);
		return policy;
	}

	function currentPolicy(cwd: string): Policy {
		return policy && policyCwd === cwd ? policy : buildPolicy(cwd);
	}

	function updateStatus(ctx: ExtensionContext) {
		const m = MODES.find((x) => x.id === mode)!;
		ctx.ui.setStatus("permissions", `${m.icon} ${m.label}${sandboxOn ? " ⛨" : ""}`);
	}

	function setMode(next: PermissionMode, ctx: ExtensionContext) {
		mode = next;
		resetSession();
		updateStatus(ctx);
		const m = MODES.find((x) => x.id === mode)!;
		ctx.ui.notify(`Mode: ${m.icon} ${m.label}`, "info");
	}

	// --- Optional sandbox: replaces the bash tool with one that wraps commands ---

	const canSandbox = sandboxAvailable();
	if (userConfig.sandbox && !canSandbox) userConfig.warnings.push("sandbox is enabled but /usr/bin/sandbox-exec is not available");
	if (userConfig.sandbox && canSandbox) {
		sandboxOn = true;
		const shell = readShellSettings();
		const definition = createBashToolDefinition(process.cwd(), {
			shellPath: shell.shellPath,
			commandPrefix: shell.commandPrefix,
			spawnHook: (spawn) => {
				if (!sandboxOn) return spawn;
				const active = currentPolicy(policyCwd ?? spawn.cwd);
				if (!profilePath) {
					const dir = mkdtempSync(join(tmpdir(), "pi-permission-gate-"));
					profilePath = join(dir, "profile.sb");
					writeFileSync(
						profilePath,
						buildSandboxProfile({
							home: active.home,
							writableRoots: [...active.projectRoots, ...active.tempRoots],
							secretPaths: active.secretPaths,
							writeProtectedPaths: active.writeProtectedPaths,
						}),
					);
				}
				return { ...spawn, command: sandboxCommand(profilePath, spawn.command) };
			},
		});
		pi.registerTool(definition);
	}

	// --- Lifecycle ---

	pi.on("session_start", async (_event, ctx) => {
		config = withProjectConfig(userConfig, ctx);
		mode = config.mode;
		if (config.sandbox && !userConfig.sandbox) {
			config.warnings.push("The project asks for the sandbox; enable \"sandbox\": true in ~/.pi/agent/permissions.json and /reload");
		}
		resetSession();
		buildPolicy(ctx.cwd);
		updateStatus(ctx);
		for (const warning of config.warnings) ctx.ui.notify(`permission-gate: ${warning}`, "warning");
	});

	// --- Gate ---

	function blockResult(findings: Finding[], command: string | undefined, ctx: ExtensionContext) {
		const reasons = describeFindings(findings.filter((f) => f.level === "block"));
		ctx.ui.notify(`⛔ Blocked: ${reasons}`, "warning");
		const userRun = command ? ` If the user really wants this, they can run it themselves with \`!${truncate(command, 120)}\`.` : "";
		return {
			block: true,
			reason: `Blocked by permission-gate: ${reasons}. This rule applies in every mode; do not try an equivalent workaround.${userRun}`,
			terminate: findings.some((f) => f.catastrophic),
		};
	}

	async function askUser(
		tool: string,
		subject: string,
		risks: Finding[],
		ctx: ExtensionContext,
		command: string | undefined,
	): Promise<{ block: true; reason: string } | undefined> {
		const reasons = describeFindings(risks);
		if (!ctx.hasUI) {
			return {
				block: true,
				reason: `permission-gate: ${reasons || tool} needs user approval, and no interactive UI is available. Ask the user to run it or to change the permission mode.`,
			};
		}
		const sessionOption = risks.length
			? `Allow "${[...new Set(risks.map((r) => r.rule))].join(", ")}" for this session`
			: tool === "bash"
				? "Allow this exact command for this session"
				: `Allow all ${tool} for this session`;
		const options = ["Allow once", sessionOption, "Deny"];
		const title = `${risks.length ? "⚠" : "🔒"} ${tool}: ${truncate(subject)}${reasons ? `\n${reasons}` : ""}`;
		const choice = await ctx.ui.select(title, options);
		if (choice === options[0]) return undefined;
		if (choice === options[1]) {
			if (risks.length) for (const r of risks) sessionRules.add(r.rule);
			else if (command !== undefined) sessionCommands.add(command);
			else sessionTools.add(tool);
			return undefined;
		}
		return {
			block: true,
			reason: `User denied ${tool}${reasons ? ` (${reasons})` : ""}. Do not retry this or an equivalent; ask the user how to proceed.`,
		};
	}

	/** Drop asks that are already allowed for the session or whose git paths are clean. */
	async function pendingRisks(verdict: Verdict): Promise<Finding[]> {
		const risks: Finding[] = [];
		for (const finding of verdict.findings) {
			if (finding.level !== "ask" || sessionRules.has(finding.rule)) continue;
			if (finding.dirtyCheck) {
				const changed = await hasChanges(finding.dirtyCheck.cwd, finding.dirtyCheck.paths);
				if (changed === false) continue;
			}
			risks.push(finding);
		}
		return risks;
	}

	pi.on("tool_call", async (event, ctx) => {
		const tool = event.toolName;
		const input = event.input as Record<string, unknown>;
		if (tool !== "bash" && !READ_TOOLS.has(tool) && !WRITE_TOOLS.has(tool)) return undefined;

		const active = currentPolicy(ctx.cwd);
		const command = tool === "bash" ? String(input.command ?? "") : undefined;
		const path = tool === "bash" ? "" : String(input.path ?? (READ_TOOLS.has(tool) ? "." : ""));
		let verdict: Verdict;
		if (command !== undefined) {
			verdict = classifyCommand(active, command, ctx.cwd);
		} else {
			const finding = WRITE_TOOLS.has(tool) ? classifyWrite(active, path, ctx.cwd) : classifyRead(active, path, ctx.cwd);
			verdict = { level: finding?.level ?? "allow", findings: finding ? [finding] : [], readOnly: READ_TOOLS.has(tool) };
		}

		if (verdict.level === "block") return blockResult(verdict.findings, command, ctx);
		if (READ_TOOLS.has(tool)) return undefined;

		if (mode === "plan") {
			if (command !== undefined) {
				if (verdict.readOnly) return undefined;
				ctx.ui.notify("⛔ Plan mode: read-only commands only", "warning");
				return { block: true, reason: "Plan mode: only read-only commands are allowed. Describe the change instead of running it." };
			}
			if (/\.md$/i.test(path) && verdict.level === "allow") return undefined;
			ctx.ui.notify("⛔ Plan mode: only .md files can be written", "warning");
			return { block: true, reason: "Plan mode: only .md files can be written." };
		}

		if (mode === "bypassPermissions") return undefined;

		const risks = await pendingRisks(verdict);
		const subject = command ?? displayPath(active, path);
		if (risks.length) {
			if (command !== undefined && sessionCommands.has(command)) return undefined;
			return askUser(tool, subject, risks, ctx, command);
		}

		if (mode === "safeMode") return undefined;
		if (command !== undefined && verdict.readOnly) return undefined;
		if (mode === "acceptEdits" && WRITE_TOOLS.has(tool)) return undefined;
		if (command !== undefined && sessionCommands.has(command)) return undefined;
		if (sessionTools.has(tool)) return undefined;
		return askUser(tool, subject, [], ctx, command);
	});

	// --- Commands ---

	pi.registerCommand("permissions", {
		description: "Show or change the permission mode",
		getArgumentCompletions: (prefix) =>
			MODES.filter((m) => m.id.startsWith(prefix)).map((m) => ({ value: m.id, label: `${m.id} — ${m.description}` })),
		handler: async (args, ctx) => {
			const requested = args?.trim();
			if (requested) {
				const next = parseMode(requested);
				if (!next) {
					ctx.ui.notify(`Unknown mode. Use: ${MODES.map((m) => m.id).join(", ")}`, "error");
					return;
				}
				setMode(next, ctx);
				return;
			}
			const choices = MODES.map((m) => `${m.icon} ${m.label}${m.id === mode ? " (current)" : ""} — ${m.description}`);
			const choice = await ctx.ui.select("Permission mode", choices);
			const index = choice === undefined ? -1 : choices.indexOf(choice);
			if (index >= 0) setMode(MODES[index]!.id, ctx);
		},
	});

	pi.registerCommand("permissions-explain", {
		description: "Show how the gate classifies a bash command",
		handler: async (args, ctx) => {
			const command = args?.trim();
			if (!command) {
				ctx.ui.notify("Usage: /permissions-explain <command>", "error");
				return;
			}
			const verdict = classifyCommand(currentPolicy(ctx.cwd), command, ctx.cwd);
			const lines = [`${verdict.level.toUpperCase()}${verdict.readOnly ? " (read-only)" : ""}: ${truncate(command)}`];
			for (const f of verdict.findings) {
				lines.push(`- [${f.level}] ${f.rule}: ${f.reason}${f.dirtyCheck ? " (only when there are uncommitted changes)" : ""}`);
			}
			ctx.ui.notify(lines.join("\n"), "info");
		},
	});

	pi.registerCommand("permissions-settings", {
		description: "Show permission gate settings",
		handler: async (_args, ctx) => {
			const active = currentPolicy(ctx.cwd);
			const m = MODES.find((x) => x.id === mode)!;
			const list = (paths: string[]) => paths.map((p) => `- ${displayPath(active, p)}`).join("\n");
			const out = [
				`# Permission Gate`,
				`Mode: ${m.label} (${m.id}) — ${m.description}`,
				`Sandbox: ${sandboxOn ? "on" : userConfig.sandbox ? "off (toggled)" : "not enabled"}`,
				`Config: ${config.sources.join(", ") || "defaults"}`,
				`Project roots:\n${list(active.projectRoots) || "- (none)"}`,
				`Secret paths (always blocked):\n${list(active.secretPaths)}`,
				`Write-protected paths (ask):\n${list(active.writeProtectedPaths)}`,
				`Disabled ask rules: ${[...active.disabledRules].join(", ") || "none"}`,
				`Session-allowed rules: ${[...sessionRules].join(", ") || "none"}`,
			];
			if (config.warnings.length) out.push(`Warnings:\n${config.warnings.map((w) => `- ${w}`).join("\n")}`);
			ctx.ui.notify(out.join("\n\n"), "info");
		},
	});

	pi.registerCommand("permissions:status", {
		description: "Show the current permission mode",
		handler: async (_args, ctx) => {
			const m = MODES.find((x) => x.id === mode)!;
			let status = `${m.icon} ${m.label} (${m.id})\n${m.description}`;
			if (sessionRules.size) status += `\nAllowed for session: ${[...sessionRules].join(", ")}`;
			if (sessionTools.size) status += `\nSession tools: ${[...sessionTools].join(", ")}`;
			if (sessionCommands.size) status += `\nSession commands: ${sessionCommands.size}`;
			ctx.ui.notify(status, "info");
		},
	});

	pi.registerCommand("sandbox", {
		description: "Turn the bash sandbox on or off for this session",
		getArgumentCompletions: (prefix) => ["on", "off"].filter((v) => v.startsWith(prefix)).map((v) => ({ value: v, label: v })),
		handler: async (args, ctx) => {
			if (!userConfig.sandbox || !canSandbox) {
				ctx.ui.notify(
					canSandbox
						? 'Sandbox is not enabled. Add "sandbox": true to ~/.pi/agent/permissions.json, then /reload.'
						: "Sandbox needs macOS /usr/bin/sandbox-exec.",
					"warning",
				);
				return;
			}
			const arg = args?.trim();
			sandboxOn = arg === "on" ? true : arg === "off" ? false : !sandboxOn;
			updateStatus(ctx);
			ctx.ui.notify(`Sandbox ${sandboxOn ? "on" : "off"}`, "info");
		},
	});

	pi.registerShortcut("ctrl+shift+p", {
		description: "Cycle permission mode (bypass is only available through /permissions)",
		handler: async (ctx) => {
			const cycle: PermissionMode[] = ["plan", "default", "acceptEdits", "safeMode"];
			const index = cycle.indexOf(mode);
			setMode(cycle[(index + 1) % cycle.length]!, ctx);
		},
	});
}
