/**
 * Permission Gate Extension - Unified
 *
 * Merged from @rhedbull/pi-permissions + custom features.
 *
 * Modes:
 *   - default:            Confirm every write, edit, and bash command
 *   - acceptEdits:        Allow write/edit silently, confirm bash
 *   - fullAuto:           Allow write/edit/bash, confirm dangerous only
 *   - safeMode:          Allow everything, silently block dangerous commands
 *   - bypassPermissions:  Allow everything, block catastrophic only
 *   - plan:              Read + markdown files only
 *
 * Commands:
 *   /permission           - Show current settings
 *   /permissions          - Interactive mode selector
 *   /permissions <mode>   - Set mode directly
 *   /permissions:status   - Show current mode
 *
 * Keyboard shortcut: Ctrl+Shift+P - Cycle through modes
 */

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { homedir } from "node:os";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

// --- Types ---

type PermissionMode = "default" | "acceptEdits" | "fullAuto" | "safeMode" | "bypassPermissions" | "plan";

interface SessionAllow {
	tools: Set<string>;
	commands: Set<string>;
}

interface PatternRule {
	pattern: string;
	description: string;
	regex?: RegExp;
}

interface ShellTrickRule {
	pattern: RegExp;
	description: string;
}

interface PermissionsConfig {
	mode?: PermissionMode;
	dangerousPatterns?: PatternRule[];
	catastrophicPatterns?: PatternRule[];
	protectedPaths?: string[];
	exemptCommands?: string[];
}

// --- Constants ---

const MODES: { id: PermissionMode; label: string; description: string; icon: string }[] = [
	{ id: "default", label: "Default", description: "Confirm every write, edit, and bash command", icon: "⏵" },
	{ id: "acceptEdits", label: "Accept Edits", description: "Allow write/edit silently, confirm bash", icon: "⏵⏵" },
	{ id: "fullAuto", label: "Full Auto", description: "Allow write/edit/bash, confirm dangerous only", icon: "⏵⏵⏵" },
	{ id: "safeMode", label: "Safe Mode", description: "Allow everything, silently block dangerous commands", icon: "⏵⏵⏵" },
	{ id: "bypassPermissions", label: "Bypass Permissions", description: "Allow everything, block catastrophic only", icon: "⏵⏵⏵⏵" },
	{ id: "plan", label: "Plan Mode", description: "Read + markdown files only", icon: "📝" },
];

const GATED_TOOLS = new Set(["write", "edit", "bash"]);

// --- Default patterns ---

const DEFAULT_DANGEROUS: PatternRule[] = [
	{ pattern: "rm -rf", description: "recursive force delete" },
	{ pattern: "chmod -R 777", description: "insecure recursive permissions" },
	{ pattern: "chown -R", description: "recursive ownership change" },
	{ pattern: "> /dev/", description: "direct device write" },
	{ pattern: "curl.*\\|.*sh", description: "pipe download to shell execution" },
	{ pattern: "wget.*\\|.*sh", description: "pipe download to shell execution" },
	{ pattern: "python.*\\|.*sh", description: "pipe python to shell execution" },
	{ pattern: "node.*\\|.*sh", description: "pipe node to shell execution" },
	{ pattern: "ruby.*\\|.*sh", description: "pipe ruby to shell execution" },
	{ pattern: "rm -rf /", description: "delete root directory" },
	{ pattern: "rm -rf /*", description: "delete root contents" },
	{ pattern: "git push --force", description: "force push to remote" },
	{ pattern: "git push -f", description: "force push to remote" },
	{ pattern: "docker rm -f", description: "force remove docker container" },
	{ pattern: "docker rmi -f", description: "force remove docker image" },
	{ pattern: "kill -9", description: "force kill process" },
	{ pattern: "pkill -9", description: "force kill by name" },
	{ pattern: "killall -9", description: "force kill all processes" },
	{ pattern: "chmod -R 777 /", description: "recursive open permissions on root" },
	{ pattern: "eval.*\\$\\(", description: "eval with command substitution" },
	{ pattern: "bash -c.*\\$", description: "bash -c with variable expansion" },
	{ pattern: "tee /", description: "write to root filesystem" },
];

const DEFAULT_CATASTROPHIC: PatternRule[] = [
	{ pattern: "sudo rm -rf /", description: "sudo recursive delete root" },
	{ pattern: "sudo rm -rf /*", description: "sudo recursive delete root contents" },
	{ pattern: "rm -rf /", description: "recursive delete root" },
	{ pattern: "rm -rf /*", description: "recursive delete root contents" },
	{ pattern: "sudo mkfs", description: "sudo filesystem format" },
	{ pattern: "mkfs", description: "filesystem format" },
	{ pattern: "dd if=", description: "raw disk read" },
	{ pattern: "dd of=", description: "raw disk write" },
	{ pattern: ":\\(\\){ :\\|:& };:", description: "fork bomb" },
	{ pattern: "sudo chmod -R 777 /", description: "sudo open all permissions on root" },
	{ pattern: "sudo chown -R", description: "sudo recursive ownership change" },
	{ pattern: "> /dev/sda", description: "overwrite disk sda" },
	{ pattern: "> /dev/nvme", description: "overwrite nvme disk" },
	{ pattern: "> /dev/sd", description: "overwrite disk device" },
	{ pattern: "sudo dd", description: "sudo raw disk operation" },
	{ pattern: "shutdown", description: "system shutdown" },
	{ pattern: "reboot", description: "system reboot" },
	{ pattern: "init 0", description: "system halt" },
	{ pattern: "init 6", description: "system reboot via init" },
	{ pattern: "halt", description: "system halt" },
	{ pattern: "poweroff", description: "system power off" },
	{ pattern: ">/dev/sd", description: "overwrite scsi disk device" },
	{ pattern: "mv / /dev/null", description: "move root to null" },
	{ pattern: "cp -r / /dev/null", description: "copy root to null" },
	{ pattern: "dnf remove --all", description: "remove all packages" },
	{ pattern: "apt remove --purge", description: "purge packages" },
	{ pattern: "pacman -Rns", description: "remove package and deps" },
];

const DEFAULT_PROTECTED_PATHS = [
	"~/.ssh",
	"~/.aws",
	"~/.gnupg",
	"~/.gpg",
	"~/.bashrc",
	"~/.bash_profile",
	"~/.profile",
	"~/.zshrc",
	"~/.zprofile",
	"~/.config/git/credentials",
	"~/.netrc",
	"~/.npmrc",
	"~/.docker/config.json",
	"~/.kube/config",
	"~/.pi/agent/auth.json",
	"~/.ssh/id_rsa",
	"~/.ssh/id_ed25519",
	"~/.ssh/known_hosts",
	"~/.aws/credentials",
	"~/.config/gcloud",
];

const DEFAULT_EXEMPT = [
	"grep", "rg", "find", "cat", "head", "tail", "less", "more", "wc",
	"sort", "uniq", "cut", "awk", "sed", "xargs", "ls", "pwd", "cd",
	"echo", "printf", "test", "true", "false", "which", "whereis",
	"type", "stat", "file", "diff", "comm", "hexdump", "od", "base64",
	"md5sum", "sha256sum", "sha1sum", "dirname", "basename", "realpath",
	"readlink", "column", "jq", "yq",
];

// Shell trick patterns — always prompt (except in bypassPermissions)
const SHELL_TRICK_PATTERNS: ShellTrickRule[] = [
	{ pattern: /\$\(/, description: "command substitution $(…)" },
	{ pattern: /`[^`]+`/, description: "backtick command substitution" },
	{ pattern: /\beval\b/, description: "eval execution" },
	{ pattern: /\bbash\s+-c\b/, description: "bash -c execution" },
	{ pattern: /\bsh\s+-c\b/, description: "sh -c execution" },
	{ pattern: /\|\s*(ba)?sh\b/, description: "pipe to shell" },
	{ pattern: /\bexec\b/, description: "exec execution" },
	{ pattern: /\bsource\b/, description: "source execution" },
	{ pattern: />\(/, description: "process substitution >(…)" },
	{ pattern: /<\(/, description: "process substitution <(…)" },
];

// --- Config loading ---

async function loadConfig(): Promise<{
	mode: PermissionMode;
	dangerousPatterns: PatternRule[];
	catastrophicPatterns: PatternRule[];
	protectedPaths: string[];
	exemptCommands: string[];
}> {
	const globalPath = resolve(homedir(), ".pi/agent/extensions/permissions.json");
	const localPath = resolve(process.cwd(), ".pi/extensions/permissions.json");

	let global: PermissionsConfig = {};
	let local: PermissionsConfig = {};

	try {
		global = JSON.parse(await readFile(globalPath, "utf-8"));
	} catch {}

	try {
		local = JSON.parse(await readFile(localPath, "utf-8"));
	} catch {}

	const dangerous = local.dangerousPatterns ?? global.dangerousPatterns ?? DEFAULT_DANGEROUS;
	const catastrophic = local.catastrophicPatterns ?? global.catastrophicPatterns ?? DEFAULT_CATASTROPHIC;

	return {
		mode: local.mode ?? global.mode ?? "acceptEdits",
		dangerousPatterns: compilePatterns(dangerous),
		catastrophicPatterns: compilePatterns(catastrophic),
		protectedPaths: local.protectedPaths ?? global.protectedPaths ?? DEFAULT_PROTECTED_PATHS,
		exemptCommands: local.exemptCommands ?? global.exemptCommands ?? DEFAULT_EXEMPT,
	};
}

/** Pre-compile regex patterns once at startup */
function compilePatterns(patterns: PatternRule[]): PatternRule[] {
	return patterns.map((p) => {
		try {
			return { ...p, regex: new RegExp(p.pattern, "i") };
		} catch {
			console.warn(`[permission-gate] Invalid regex pattern: ${p.pattern}`);
			return p; // Keep for substring matching fallback
		}
	});
}

/** Match against pre-compiled regex or fall back to substring match */
function matchesRule(command: string, rules: PatternRule[]): PatternRule | undefined {
	for (const p of rules) {
		if (p.regex) {
			if (p.regex.test(command)) return p;
		} else if (command.includes(p.pattern)) {
			return p;
		}
	}
	return undefined;
}

/** Build exempt command regex once at startup */
function buildExemptRegex(commands: string[]): RegExp {
	const escaped = commands.map((c) => c.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
	return new RegExp(`^\\s*(?:${escaped.join("|")})\\b`, "i");
}

// --- Approval prompt ---

async function promptApproval(
	toolName: string,
	input: Record<string, unknown>,
	ctx: { ui: any },
	dangerousPatterns: PatternRule[],
	catastrophicPatterns: PatternRule[],
	sessionAllow: SessionAllow,
): Promise<{ block: true; reason: string } | undefined> {
	let icon = "🔒";
	let description: string;

	if (toolName === "bash") {
		const command = String(input.command ?? "");
		const catastrophe = matchesRule(command, catastrophicPatterns);
		const danger = matchesRule(command, dangerousPatterns);
		const displayCmd = command.length > 200 ? command.slice(0, 200) + "…" : command;

		if (catastrophe) {
			icon = "🚫";
			description = `bash: ${displayCmd}\n🚫 CATASTROPHIC: ${catastrophe.description}`;
		} else if (danger) {
			icon = "⚠️";
			description = `bash: ${displayCmd}\n⚠️ DANGEROUS: ${danger.description}`;
		} else {
			description = `bash: ${displayCmd}`;
		}
	} else if (toolName === "write") {
		description = `write: ${input.path}`;
	} else if (toolName === "edit") {
		description = `edit: ${input.path}`;
	} else {
		description = `${toolName}`;
	}

	const options = [
		"Allow once",
		toolName === "bash" ? "Allow command for session" : `Allow all ${toolName} for session`,
		"Deny",
	];

	const choice = await ctx.ui.select(`${icon} ${description}`, options);

	if (choice === options[0]) return undefined;

	if (choice === options[1]) {
		if (toolName === "bash") {
			sessionAllow.commands.add(String(input.command ?? ""));
		} else {
			sessionAllow.tools.add(toolName);
		}
		return undefined;
	}

	return { block: true, reason: `User denied ${toolName}` };
}

// --- Extension ---

export default async function (pi: ExtensionAPI) {
	const config = await loadConfig();

	let mode: PermissionMode = config.mode;
	const dangerousPatterns = config.dangerousPatterns;
	const catastrophicPatterns = config.catastrophicPatterns;
	const home = homedir();
	const resolvedProtectedPaths = config.protectedPaths.map((p) =>
		p.startsWith("~/") ? resolve(home, p.slice(2)) : resolve(p)
	);
	const sessionAllow: SessionAllow = { tools: new Set(), commands: new Set() };
	const exemptCommandRegex = buildExemptRegex(config.exemptCommands);

	// --- Status widget ---

	function updateStatus(ctx: { ui: { setStatus: (id: string, text: string | undefined) => void } }) {
		const m = MODES.find((m) => m.id === mode)!;
		ctx.ui.setStatus("permissions", `${m.icon} ${m.label}`);
	}

	pi.on("session_start", async (_event, ctx) => {
		sessionAllow.tools.clear();
		sessionAllow.commands.clear();
		updateStatus(ctx);
	});

	// --- Permission gate ---

	pi.on("tool_call", async (event, ctx) => {
		const toolName = event.toolName;

		// --- Plan mode: allow only read + .md write/edit ---
		if (mode === "plan") {
			if (toolName === "read") return undefined;

			if (toolName === "write" || toolName === "edit") {
				const path = String(event.input.path ?? "");
				if (/\.md$/i.test(path)) return undefined;

				// Check protected paths even in plan mode
				const targetPath = resolve(path);
				const blocked = resolvedProtectedPaths.find((p) => targetPath === p || targetPath.startsWith(p + "/"));
				if (blocked) {
					ctx.ui.notify(`🚫 Protected path blocked: ${blocked.replace(home, "~")}`, "error");
					return { block: true, reason: `Protected path: ${blocked}` };
				}

				ctx.ui.notify("⛔ Plan mode: only .md files allowed", "warning");
				return { block: true, reason: "Plan mode: only .md files allowed" };
			}

			if (toolName === "bash") {
				const command = String(event.input.command ?? "");

				// Allow exempt read-only commands in plan mode
				if (exemptCommandRegex.test(command)) return undefined;

				ctx.ui.notify("⛔ Plan mode: read + markdown files only", "warning");
				return { block: true, reason: "Plan mode: read + markdown files only" };
			}

			ctx.ui.notify("⛔ Plan mode: read + markdown files only", "warning");
			return { block: true, reason: "Plan mode: read + markdown files only" };
		}

		// --- Non-gated tools: always allow ---
		if (!GATED_TOOLS.has(toolName)) return undefined;

		// --- Bash-specific checks (all modes except plan) ---
		if (toolName === "bash") {
			const command = String(event.input.command ?? "");

			// Skip exempt read-only commands
			if (exemptCommandRegex.test(command)) return undefined;

			// CATASTROPHIC CHECK — always blocked, every mode
			const catastrophe = matchesRule(command, catastrophicPatterns);
			if (catastrophe) {
				ctx.ui.notify(`🚫 Catastrophic: ${catastrophe.description}`, "error");
				return { block: true, reason: `Catastrophic: ${catastrophe.description}` };
			}

			// Protected path check for bash
			const blockedPath = resolvedProtectedPaths.find((p) =>
				command.includes(p) || command.includes(p.replace(home, "~"))
			);
			if (blockedPath) {
				const readable = blockedPath.replace(home, "~");
				ctx.ui.notify(`🚫 Protected path: ${readable}`, "error");
				return { block: true, reason: `Protected path: ${readable}` };
			}
		}

		// --- Write/Edit protected path checks (all modes except plan) ---
		if (toolName === "write" || toolName === "edit") {
			const targetPath = resolve(String(event.input.path ?? ""));
			const blocked = resolvedProtectedPaths.find((p) => targetPath === p || targetPath.startsWith(p + "/"));
			if (blocked) {
				ctx.ui.notify(`🚫 Protected path blocked: ${blocked.replace(home, "~")}`, "error");
				return { block: true, reason: `Protected path: ${blocked}` };
			}
		}

		// --- SafeMode: silently block dangerous, allow everything else ---
		if (mode === "safeMode") {
			if (toolName === "write" || toolName === "edit") return undefined;

			if (toolName === "bash") {
				const command = String(event.input.command ?? "");

				// Shell trick check in safeMode — prompt since it could be dangerous
				const trick = SHELL_TRICK_PATTERNS.find((p) => p.pattern.test(command));
				if (trick) {
					ctx.ui.notify(`⛔ Blocked shell trick: ${trick.description}`, "warning");
					return { block: true, reason: `Shell trick blocked: ${trick.description}` };
				}

				const danger = matchesRule(command, dangerousPatterns);
				if (danger) {
					ctx.ui.notify(`⛔ Blocked: ${danger.description}`, "warning");
					return { block: true, reason: `Dangerous command blocked: ${danger.description}` };
				}
			}

			return undefined;
		}

		// --- Bypass: everything allowed (catastrophic & protected paths already checked above) ---
		if (mode === "bypassPermissions") return undefined;

		// --- Shell trick check (not in bypassPermissions) ---
		if (toolName === "bash" && mode !== "bypassPermissions") {
			const command = String(event.input.command ?? "");
			const trick = SHELL_TRICK_PATTERNS.find((p) => p.pattern.test(command));
			if (trick) {
				if (!ctx.hasUI) {
					return { block: true, reason: `Shell trick blocked: ${trick.description}` };
				}
				const displayCmd = command.length > 200 ? command.slice(0, 200) + "…" : command;
				const choice = await ctx.ui.select(`⚠️ bash: ${displayCmd}\n⚠️ SHELL TRICK: ${trick.description}`, ["Allow once", "Deny"]);
				if (choice !== "Allow once") {
					return { block: true, reason: `Shell trick denied: ${trick.description}` };
				}
				return undefined;
			}
		}

		// --- acceptEdits: skip write/edit ---
		if (mode === "acceptEdits" && (toolName === "write" || toolName === "edit")) return undefined;

		// --- fullAuto: skip safe operations ---
		if (mode === "fullAuto") {
			if (toolName === "write" || toolName === "edit") return undefined;
			if (toolName === "bash") {
				const command = String(event.input.command ?? "");
				const danger = matchesRule(command, dangerousPatterns);
				if (!danger) return undefined;
			}
		}

		// --- Session allows ---
		if (toolName === "bash" && sessionAllow.commands.has(String(event.input.command ?? ""))) return undefined;
		if (sessionAllow.tools.has(toolName)) return undefined;

		// --- Prompt for approval ---
		return promptApproval(toolName, event.input as Record<string, unknown>, ctx, dangerousPatterns, catastrophicPatterns, sessionAllow);
	});

	// --- Commands ---

	pi.registerCommand("permission", {
		description: "Show permission gate settings",
		handler: async (_args, ctx) => {
			const currentMode = MODES.find((m) => m.id === mode)!;
			let output = `# Permission Gate Settings\n\n`;
			output += `**Mode:** ${mode} — ${currentMode.description}\n\n`;
			output += `## Dangerous Patterns (${dangerousPatterns.length})\n`;
			for (const p of dangerousPatterns) output += `- \`${p.pattern}\` — ${p.description}\n`;
			output += `\n## Catastrophic Patterns (${catastrophicPatterns.length})\n`;
			for (const p of catastrophicPatterns) output += `- \`${p.pattern}\` — ${p.description}\n`;
			output += `\n## Protected Paths (${config.protectedPaths.length})\n`;
			for (const p of config.protectedPaths) output += `- \`${p}\`\n`;
			output += `\n## Exempt Commands (${config.exemptCommands.length})\n`;
			output += `\`${config.exemptCommands.join(", ")}\`\n`;
			ctx.ui.notify(output, "info");
		},
	});

	pi.registerCommand("permissions", {
		description: "Show or change permission mode",
		getArgumentCompletions: (prefix) => {
			const items = MODES.map((m) => ({ value: m.id, label: `${m.id} — ${m.description}` }));
			return items.filter((i) => i.value.startsWith(prefix));
		},
		handler: async (args, ctx) => {
			if (args?.trim()) {
				const target = args.trim() as PermissionMode;
				const found = MODES.find((m) => m.id === target);
				if (!found) {
					ctx.ui.notify(`Unknown mode. Use: ${MODES.map((m) => m.id).join(", ")}`, "error");
					return;
				}
				mode = found.id;
				sessionAllow.tools.clear();
				sessionAllow.commands.clear();
				updateStatus(ctx);
				ctx.ui.notify(`Mode: ${found.icon} ${found.label}`, "info");
				return;
			}

			const choices = MODES.map((m) => {
				const current = m.id === mode ? " (current)" : "";
				return `${m.icon} ${m.label}${current}`;
			});

			const choice = await ctx.ui.select("Permission Mode", choices);
			if (choice === undefined) return;

			const idx = choices.indexOf(choice);
			if (idx >= 0) {
				mode = MODES[idx]!.id;
				sessionAllow.tools.clear();
				sessionAllow.commands.clear();
				updateStatus(ctx);
				ctx.ui.notify(`Mode: ${MODES[idx]!.icon} ${MODES[idx]!.label}`, "info");
			}
		},
	});

	pi.registerCommand("permissions:status", {
		description: "Show current permission mode",
		handler: async (_args, ctx) => {
			const m = MODES.find((m) => m.id === mode)!;
			let status = `${m.icon} ${m.label} (${m.id})\n${m.description}`;
			if (sessionAllow.tools.size > 0) status += `\nSession tools: ${[...sessionAllow.tools].join(", ")}`;
			if (sessionAllow.commands.size > 0) status += `\nSession commands: ${sessionAllow.commands.size}`;
			ctx.ui.notify(status, "info");
		},
	});

	// --- Keyboard shortcut: cycle modes ---
	pi.registerShortcut("ctrl+shift+p", {
		description: "Cycle permission mode",
		handler: async (ctx) => {
			const idx = MODES.findIndex((m) => m.id === mode);
			mode = MODES[(idx + 1) % MODES.length]!.id;
			sessionAllow.tools.clear();
			sessionAllow.commands.clear();
			updateStatus(ctx);
			ctx.ui.notify(`Mode: ${MODES.find((m) => m.id === mode)!.icon} ${MODES.find((m) => m.id === mode)!.label}`, "info");
		},
	});
}