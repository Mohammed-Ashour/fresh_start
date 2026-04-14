/**
 * Permission Gate Extension
 *
 * Prompts for confirmation before running potentially dangerous bash commands.
 * Uses permissions.json for configurable patterns and modes.
 *
 * Modes:
 * - "acceptEdits" (default): edits auto-allow, bash confirms, dangerous blocked
 * - "confirmAll": always ask before running bash commands
 * - "blockAll": block all bash commands (use with caution)
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { homedir } from "node:os";

interface DangerousPattern {
	pattern: string;
	description: string;
}

interface CatastrophicPattern {
	pattern: string;
	description: string;
}

interface PermissionsConfig {
	mode?: "acceptEdits" | "confirmAll" | "blockAll";
	dangerousPatterns?: DangerousPattern[];
	catastrophicPatterns?: CatastrophicPattern[];
	protectedPaths?: string[];
}

const DEFAULT_CONFIG: PermissionsConfig = {
	mode: "acceptEdits",
	dangerousPatterns: [
		{ pattern: "rm -rf", description: "recursive force delete" },
		{ pattern: "chmod -R 777", description: "insecure recursive permissions" },
		{ pattern: "chown -R", description: "recursive ownership change" },
		{ pattern: "> /dev/", description: "direct device write" },
	],
	catastrophicPatterns: [
		{ pattern: "sudo rm -rf /", description: "sudo recursive delete root" },
		{ pattern: "sudo rm -rf /*", description: "sudo recursive delete root contents" },
		{ pattern: "rm -rf /", description: "recursive delete root" },
		{ pattern: "rm -rf /*", description: "recursive delete root contents" },
		{ pattern: "sudo mkfs", description: "sudo filesystem format" },
		{ pattern: "mkfs.", description: "filesystem format" },
		{ pattern: "dd if=", description: "raw disk write" },
		{ pattern: ":(){ :|:& };:", description: "fork bomb" },
		{ pattern: "sudo chmod -R 777 /", description: "sudo open all permissions on root" },
		{ pattern: "sudo chown -R", description: "sudo recursive ownership change" },
		{ pattern: "> /dev/sda", description: "overwrite disk" },
		{ pattern: "> /dev/nvme", description: "overwrite disk" },
		{ pattern: "sudo dd", description: "sudo raw disk operation" },
	],
	protectedPaths: [
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
	],
};

function expandPath(path: string): string {
	if (path.startsWith("~/")) {
		return resolve(homedir(), path.slice(2));
	}
	return resolve(path);
}

function loadPermissionsConfig(extensionsDir: string): PermissionsConfig {
	const configPath = join(extensionsDir, "permissions.json");

	if (existsSync(configPath)) {
		try {
			const content = readFileSync(configPath, "utf-8");
			const loaded = JSON.parse(content) as PermissionsConfig;
			// Merge with defaults
			return {
				...DEFAULT_CONFIG,
				...loaded,
				dangerousPatterns: [...(DEFAULT_CONFIG.dangerousPatterns || []), ...(loaded.dangerousPatterns || [])],
				catastrophicPatterns: [
					...(DEFAULT_CONFIG.catastrophicPatterns || []),
					...(loaded.catastrophicPatterns || []),
				],
				protectedPaths: [...(DEFAULT_CONFIG.protectedPaths || []), ...(loaded.protectedPaths || [])],
			};
		} catch (e) {
			console.error(`Warning: Could not parse permissions.json: ${e}`);
		}
	}

	return DEFAULT_CONFIG;
}

function matchPattern(command: string, pattern: string): boolean {
	// Handle regex-like patterns
	if (pattern.startsWith("> /dev/")) {
		// Special case: check if command writes to device
		return command.includes(">") && command.includes("/dev/");
	}
	// Simple contains check for most patterns
	return command.includes(pattern);
}

function checkCatastrophic(command: string, patterns: CatastrophicPattern[]): CatastrophicPattern | null {
	for (const { pattern, description } of patterns) {
		if (matchPattern(command, pattern)) {
			return { pattern, description };
		}
	}
	return null;
}

function checkDangerous(command: string, patterns: DangerousPattern[]): DangerousPattern | null {
	for (const { pattern, description } of patterns) {
		if (matchPattern(command, pattern)) {
			return { pattern, description };
		}
	}
	return null;
}

function checkProtectedPath(command: string, protectedPaths: string[]): string | null {
	const expandedPaths = protectedPaths.map(expandPath);
	for (const protectedPath of expandedPaths) {
		if (command.includes(protectedPath)) {
			return protectedPath;
		}
	}
	return null;
}

export default function (pi: ExtensionAPI) {
	// Get extensions directory from pi's agent dir
	const agentDir = pi["agentDir"] as string | undefined;
	const extensionsDir = agentDir ? join(agentDir, "extensions") : join(homedir(), ".pi", "agent", "extensions");
	const config = loadPermissionsConfig(extensionsDir);

	pi.on("tool_call", async (event, ctx) => {
		// Handle bash tool
		if (event.toolName === "bash") {
			const command = event.input.command as string;

			// Mode: blockAll - block all bash commands
			if (config.mode === "blockAll") {
				if (!ctx.hasUI) {
					return { block: true, reason: "All bash commands blocked (blockAll mode)" };
				}
				const choice = await ctx.ui.select(
					`⚠️ Bash blocked by configuration:\n\n  ${command}\n\nOverride?`,
					["Allow Once", "Block"],
				);
				if (choice !== "Allow Once") {
					return { block: true, reason: "Blocked by configuration" };
				}
				return undefined;
			}

			// Check for catastrophic patterns first (always block)
			const catastrophic = checkCatastrophic(command, config.catastrophicPatterns || []);
			if (catastrophic) {
				if (!ctx.hasUI) {
					return { block: true, reason: `Catastrophic command blocked: ${catastrophic.description}` };
				}
				const choice = await ctx.ui.select(
					`🚨 CATASTROPHIC COMMAND:\n\n  ${command}\n\n${catastrophic.description}\n\nThis will destroy your system. Block?`,
					["Block", "Allow Anyway"],
				);
				if (choice === "Block") {
					return { block: true, reason: `Catastrophic: ${catastrophic.description}` };
				}
				// User chose to allow anyway - continue
			}

			// Mode: confirmAll - ask before every command
			if (config.mode === "confirmAll") {
				if (!ctx.hasUI) {
					return { block: true, reason: "Bash requires confirmation (confirmAll mode)" };
				}
				const choice = await ctx.ui.select(`⚠️ Bash command:\n\n  ${command}\n\nRun?`, ["Run", "Cancel"]);
				if (choice !== "Run") {
					return { block: true, reason: "Cancelled by user" };
				}
				return undefined;
			}

			// Mode: acceptEdits (default) - check for dangerous patterns
			const dangerous = checkDangerous(command, config.dangerousPatterns || []);
			if (dangerous) {
				if (!ctx.hasUI) {
					return { block: true, reason: `Dangerous command requires confirmation: ${dangerous.description}` };
				}
				const choice = await ctx.ui.select(
					`⚠️ Dangerous command:\n\n  ${command}\n\n${dangerous.description}\n\nAllow?`,
					["Yes", "No"],
				);
				if (choice !== "Yes") {
					return { block: true, reason: `Dangerous: ${dangerous.description}` };
				}
			}

			return undefined;
		}

		// Handle write/edit tools - check protected paths
		if (event.toolName === "write" || event.toolName === "edit") {
			const path = (event.input.path || "") as string;
			if (path) {
				const protectedPath = checkProtectedPath(path, config.protectedPaths || []);
				if (protectedPath) {
					if (!ctx.hasUI) {
						return { block: true, reason: `Cannot modify protected path: ${protectedPath}` };
					}
					const choice = await ctx.ui.select(
						`🔒 Protected Path:\n\n  ${path}\n\nThis path contains sensitive data.\n\nAllow modification?`,
						["Block", "Allow Anyway"],
					);
					if (choice === "Block") {
						return { block: true, reason: `Protected path: ${protectedPath}` };
					}
				}
			}
		}

		return undefined;
	});
}
