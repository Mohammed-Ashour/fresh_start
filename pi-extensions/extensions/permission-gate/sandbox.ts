/**
 * Optional macOS Seatbelt sandbox for the bash tool.
 *
 * Commands may write only inside the project, temp folders, and common tool
 * caches, may not read secret paths, and may not write protected paths. This is
 * the real boundary; the policy rules are the friendly layer on top of it.
 */

import { existsSync } from "node:fs";
import { join } from "node:path";

export const SANDBOX_EXEC = "/usr/bin/sandbox-exec";

/** Home-relative folders that package managers and build tools write to. */
export const DEFAULT_WRITABLE_HOME_PATHS = [
	".cache",
	"Library/Caches",
	"Library/Developer",
	".npm",
	".pnpm-store",
	"Library/pnpm",
	".yarn",
	".bun",
	".cargo/registry",
	".cargo/git",
	".rustup",
	"go/pkg",
	".gradle",
	".m2",
	".local/share",
	".local/state",
	".pyenv",
];

export interface SandboxPaths {
	home: string;
	writableRoots: string[];
	secretPaths: string[];
	writeProtectedPaths: string[];
}

export function sandboxAvailable(): boolean {
	return process.platform === "darwin" && existsSync(SANDBOX_EXEC);
}

function sbplString(path: string): string {
	return `"${path.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

function subpaths(paths: string[]): string {
	return paths.map((p) => `(subpath ${sbplString(p)})`).join(" ");
}

/** Build a Seatbelt profile. Later rules win, so denials come last. */
export function buildSandboxProfile(paths: SandboxPaths): string {
	const writable = [
		...paths.writableRoots,
		...DEFAULT_WRITABLE_HOME_PATHS.map((p) => join(paths.home, p)),
		"/dev",
		"/private/var/folders",
		"/private/tmp",
	];
	const lines = [
		"(version 1)",
		"(allow default)",
		"(deny file-write*)",
		`(allow file-write* ${subpaths(writable)})`,
	];
	if (paths.writeProtectedPaths.length) lines.push(`(deny file-write* ${subpaths(paths.writeProtectedPaths)})`);
	if (paths.secretPaths.length) lines.push(`(deny file-read* file-write* ${subpaths(paths.secretPaths)})`);
	return lines.join("\n") + "\n";
}

export function shellQuote(text: string): string {
	return `'${text.replace(/'/g, `'\\''`)}'`;
}

/** Wrap a command so it runs inside the sandbox described by `profilePath`. */
export function sandboxCommand(profilePath: string, command: string, shell = "/bin/bash"): string {
	return `exec ${SANDBOX_EXEC} -f ${shellQuote(profilePath)} ${shellQuote(shell)} -c ${shellQuote(command)}`;
}
