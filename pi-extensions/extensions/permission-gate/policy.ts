/**
 * Permission policy: a small shell parser plus rules that classify tool calls as
 * allow, ask, or block.
 *
 * Design goals:
 *   - Catastrophic actions and secret access are blocked in every mode.
 *   - Ordinary development work (builds, tests, edits, deleting build output, plain
 *     git pushes) never asks.
 *   - Only actions that lose data outside version control or reach outside the
 *     machine irreversibly ask, so safe mode stays quiet.
 *
 * This module has no Pi imports so tests can load it directly with Node.
 */

import { existsSync, realpathSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { basename, dirname, isAbsolute, join, resolve } from "node:path";

// --- Public types ---

export type Level = "allow" | "ask" | "block";

export interface Finding {
	level: Level;
	/** Stable id. Ask-level rules can be disabled through `disabledRules`. */
	rule: string;
	reason: string;
	/** Catastrophic blocks stop the agent turn instead of letting it retry. */
	catastrophic?: boolean;
	/** Ask only when these paths have uncommitted changes in this repository. */
	dirtyCheck?: { cwd: string; paths: string[] };
}

export interface Verdict {
	level: Level;
	findings: Finding[];
	/** True when every part of the command only reads. Used by plan/default modes. */
	readOnly: boolean;
}

export interface PatternRule {
	pattern: string;
	description: string;
}

export interface PolicyOptions {
	cwd: string;
	home?: string;
	/** Extra project roots, for example the git top level. */
	projectRoots?: string[];
	tempRoots?: string[];
	extraSecretPaths?: string[];
	extraWriteProtectedPaths?: string[];
	extraReadOnlyCommands?: string[];
	askPatterns?: PatternRule[];
	blockPatterns?: PatternRule[];
	disabledRules?: string[];
	env?: Record<string, string | undefined>;
	platform?: NodeJS.Platform;
}

export interface Policy {
	home: string;
	projectRoots: string[];
	tempRoots: string[];
	secretPaths: string[];
	writeProtectedPaths: string[];
	readOnlyCommands: Set<string>;
	askPatterns: { regex: RegExp; description: string }[];
	blockPatterns: { regex: RegExp; description: string }[];
	disabledRules: Set<string>;
	caseInsensitive: boolean;
	env: Record<string, string | undefined>;
	invalidPatterns: string[];
}

// --- Defaults ---

/** Never readable or writable by the agent, in any mode. */
export const DEFAULT_SECRET_PATHS = [
	"~/.ssh",
	"~/.aws",
	"~/.azure",
	"~/.gnupg",
	"~/.netrc",
	"~/.git-credentials",
	"~/.config/git/credentials",
	"~/.config/gh",
	"~/.config/gcloud",
	"~/.config/op",
	"~/.docker/config.json",
	"~/.kube/config",
	"~/.npmrc",
	"~/.pypirc",
	"~/.gem/credentials",
	"~/.cargo/credentials",
	"~/.cargo/credentials.toml",
	"~/.terraform.d/credentials.tfrc.json",
	"~/.password-store",
	"~/Library/Keychains",
	"~/.pi/agent/auth.json",
	"~/.pi/agent/codex-accounts.json",
	"~/.codex/auth.json",
	"~/.claude/.credentials.json",
];

/**
 * Readable, but writes ask first: shell startup files, agent configuration, and
 * this gate itself, so a prompt injection cannot quietly persist or disable it.
 * `<project>/.pi` is added for every project root.
 */
export const DEFAULT_WRITE_PROTECTED_PATHS = [
	"~/.bashrc",
	"~/.bash_profile",
	"~/.bash_login",
	"~/.profile",
	"~/.zshrc",
	"~/.zprofile",
	"~/.zshenv",
	"~/.zlogin",
	"~/.config/fish",
	"~/.gitconfig",
	"~/.config/git/config",
	"~/Library/LaunchAgents",
	"~/.pi/agent/extensions",
	"~/.pi/agent/permissions.json",
	"~/.pi/agent/settings.json",
	"~/.pi/agent/AGENTS.md",
	"~/.pi/agent/trust.json",
	"~/.agents/skills",
];

export const DEFAULT_READ_ONLY_COMMANDS = [
	"cat", "head", "tail", "less", "more", "wc", "sort", "uniq", "cut", "tr", "nl", "tac", "rev",
	"fold", "paste", "join", "column", "comm", "cmp", "diff", "grep", "egrep", "fgrep", "rg", "ag",
	"ack", "fd", "find", "ls", "tree", "du", "df", "stat", "file", "which", "whereis", "type",
	"command", "echo", "printf", "true", "false", "test", "[", "[[", "pwd", "cd", "pushd", "popd",
	"dirs", "basename", "dirname", "realpath", "readlink", "md5", "md5sum", "shasum", "sha1sum",
	"sha256sum", "sha512sum", "cksum", "base64", "xxd", "hexdump", "od", "strings", "jq", "yq",
	"sed", "awk", "gawk", "xargs", "date", "cal", "whoami", "id", "groups", "uname", "hostname",
	"uptime", "ps", "pgrep", "lsof", "env", "printenv", "locale", "sw_vers", "arch", "nproc", "man",
	"git", "sleep", "seq", "expr", "bat",
];

// --- Policy construction ---

export function createPolicy(options: PolicyOptions): Policy {
	const platform = options.platform ?? process.platform;
	const caseInsensitive = platform === "darwin" || platform === "win32";
	const home = normalizePath(options.home ?? homedir(), "/");
	const expand = (p: string) => normalizePath(expandHome(p, home), options.cwd);
	const homeKey = key(home, caseInsensitive);

	// A session started in the home folder (or above) has no project: treating all
	// of home as the project would allow deleting anything in it.
	const projectRoots = unique(
		[options.cwd, ...(options.projectRoots ?? [])]
			.map((p) => normalizePath(p, options.cwd))
			.filter((p) => !isWithin(homeKey, key(p, caseInsensitive))),
	);

	const tempRoots = unique(
		[...(options.tempRoots ?? [tmpdir(), "/tmp", "/private/tmp", "/var/tmp", "/private/var/tmp"])].map((p) =>
			normalizePath(p, "/"),
		),
	);

	const compile = (rules: PatternRule[] | undefined, invalid: string[]) =>
		(rules ?? []).flatMap((r) => {
			try {
				return [{ regex: new RegExp(r.pattern, "i"), description: r.description }];
			} catch {
				invalid.push(r.pattern);
				return [];
			}
		});
	const invalidPatterns: string[] = [];

	return {
		home,
		projectRoots,
		tempRoots,
		secretPaths: unique([...DEFAULT_SECRET_PATHS, ...(options.extraSecretPaths ?? [])].map(expand)),
		writeProtectedPaths: unique([
			...[...DEFAULT_WRITE_PROTECTED_PATHS, ...(options.extraWriteProtectedPaths ?? [])].map(expand),
			...projectRoots.map((root) => join(root, ".pi")),
		]),
		readOnlyCommands: new Set([...DEFAULT_READ_ONLY_COMMANDS, ...(options.extraReadOnlyCommands ?? [])]),
		askPatterns: compile(options.askPatterns, invalidPatterns),
		blockPatterns: compile(options.blockPatterns, invalidPatterns),
		disabledRules: new Set(options.disabledRules ?? []),
		caseInsensitive,
		env: { ...process.env, ...(options.env ?? {}) },
		invalidPatterns,
	};
}

// --- Path helpers ---

function unique<T>(items: T[]): T[] {
	return [...new Set(items)];
}

export function expandHome(path: string, home: string): string {
	if (path === "~") return home;
	if (path.startsWith("~/")) return home + path.slice(1);
	return path;
}

/** Absolute path with symlinks resolved on the deepest existing ancestor. */
export function normalizePath(path: string, base: string): string {
	const absolute = resolve(base, path);
	let existing = absolute;
	const rest: string[] = [];
	while (!existsSync(existing)) {
		const parent = dirname(existing);
		if (parent === existing) break;
		rest.unshift(basename(existing));
		existing = parent;
	}
	let real = existing;
	try {
		real = realpathSync.native(existing);
	} catch {}
	return rest.length ? join(real, ...rest) : real;
}

function key(path: string, caseInsensitive: boolean): string {
	return caseInsensitive ? path.toLowerCase() : path;
}

/** True when `child` equals `parent` or lies inside it. Both must be keys. */
function isWithin(child: string, parent: string): boolean {
	if (child === parent) return true;
	return child.startsWith(parent === "/" ? "/" : parent + "/");
}

function within(policy: Policy, child: string, parent: string): boolean {
	return isWithin(key(child, policy.caseInsensitive), key(parent, policy.caseInsensitive));
}

function same(policy: Policy, a: string, b: string): boolean {
	return key(a, policy.caseInsensitive) === key(b, policy.caseInsensitive);
}

function findSecret(policy: Policy, path: string): string | undefined {
	return policy.secretPaths.find((s) => within(policy, path, s));
}

function findWriteProtected(policy: Policy, path: string): string | undefined {
	return policy.writeProtectedPaths.find((p) => within(policy, path, p));
}

export function displayPath(policy: Policy, path: string): string {
	if (within(policy, path, policy.home)) return "~" + path.slice(policy.home.length);
	return path;
}

const USER_DATA_DIRS = ["Library", "Documents", "Desktop", "Pictures", "Movies", "Music", "Downloads", ".config", ".pi", ".local"];

/** Paths whose removal (or removal of their contents) would wreck the machine or the user's data. */
function isCriticalPath(policy: Policy, path: string): boolean {
	const k = key(path, policy.caseInsensitive);
	const home = key(policy.home, policy.caseInsensitive);
	if (k === "/") return true;
	if (isWithin(home, k)) return true; // home itself or any ancestor, such as /Users
	const parts = k.split("/").filter(Boolean);
	if (parts.length === 1) return true; // /usr, /etc, /Applications, ...
	if (parts[0] === "volumes" && parts.length === 2) return true;
	if (parts[0] === "private" && parts.length === 2) return true; // /private/var, /private/etc
	if (["system", "bin", "sbin"].includes(parts[0]!)) return true;
	if (parts[0] === "usr" && parts[1] !== "local") return true;
	if (k === "/usr/local" || k === "/opt/homebrew") return true;
	if (USER_DATA_DIRS.some((d) => k === key(join(policy.home, d), policy.caseInsensitive))) return true;
	return false;
}

/** System locations where writes are unusual for a coding agent. */
function isSystemPath(policy: Policy, path: string): boolean {
	const k = key(path, policy.caseInsensitive);
	return ["/etc", "/private/etc", "/system", "/bin", "/sbin", "/library", "/usr"].some(
		(p) => isWithin(k, p) && !isWithin(k, "/usr/local"),
	);
}

const DISK_DEVICE = /^\/dev\/(r?disk\d|sd[a-z]|nvme\d|hd[a-z]|mmcblk\d|xvd[a-z]|vd[a-z])/i;
const HARMLESS_DEVICES = /^\/dev\/(null|zero|stdout|stderr|stdin|tty|fd\/\d+|random|urandom)$/;

// --- File tool classification ---

/** Classify a read, grep, find, or ls of `path`. */
export function classifyRead(policy: Policy, path: string, cwd: string): Finding | undefined {
	const target = normalizePath(expandHome(path || ".", policy.home), cwd);
	const secret = findSecret(policy, target);
	if (secret) {
		return { level: "block", rule: "secret-path", reason: `secret path ${displayPath(policy, secret)}` };
	}
	return undefined;
}

/** Classify a write or edit of `path`. */
export function classifyWrite(policy: Policy, path: string, cwd: string): Finding | undefined {
	const target = normalizePath(expandHome(path, policy.home), cwd);
	return writeTargetFinding(policy, target);
}

function writeTargetFinding(policy: Policy, target: string): Finding | undefined {
	if (HARMLESS_DEVICES.test(target)) return undefined;
	const secret = findSecret(policy, target);
	if (secret) return { level: "block", rule: "secret-path", reason: `secret path ${displayPath(policy, secret)}` };
	if (DISK_DEVICE.test(target)) {
		return { level: "block", rule: "disk-device", reason: `write to disk device ${target}`, catastrophic: true };
	}
	const guarded = findWriteProtected(policy, target);
	if (guarded) {
		return { level: "ask", rule: "protected-write", reason: `write to protected path ${displayPath(policy, guarded)}` };
	}
	if (isSystemPath(policy, target)) {
		return { level: "ask", rule: "system-write", reason: `write to system path ${target}` };
	}
	return undefined;
}

// --- Shell parser ---

export interface Word {
	text: string;
	/** Contains an expansion we could not resolve. */
	dynamic: boolean;
	/** Contains unquoted glob characters. */
	glob: boolean;
	quoted: boolean;
	/** Command or process substitutions inside this word. */
	subs: string[];
}

interface Redirect {
	op: string;
	target?: Word;
}

interface Command {
	words: Word[];
	redirects: Redirect[];
	heredocs: { body: string; quoted: boolean }[];
}

interface ParseResult {
	pipelines: Command[][];
	subs: string[];
	error?: string;
}

const WORD_BREAK = " \t\r\n;&|<>()";
const NAME_RE = /^[A-Za-z_][A-Za-z0-9_]*/;
const ASSIGNMENT_RE = /^[A-Za-z_][A-Za-z0-9_]*\+?=/;

function newCommand(): Command {
	return { words: [], redirects: [], heredocs: [] };
}

class ShellParser {
	private i = 0;
	private pipelines: Command[][] = [];
	private pipeline: Command[] = [];
	private cmd: Command = newCommand();
	private pending: { delim: string; strip: boolean; quoted: boolean; cmd: Command }[] = [];
	readonly subs: string[] = [];
	error?: string;

	private readonly src: string;
	private readonly vars: Map<string, string>;
	private readonly env: Record<string, string | undefined>;
	private readonly home: string;

	constructor(src: string, vars: Map<string, string>, env: Record<string, string | undefined>, home: string) {
		this.src = src;
		this.vars = vars;
		this.env = env;
		this.home = home;
	}

	parse(): ParseResult {
		const s = this.src;
		while (this.i < s.length) {
			const c = s[this.i]!;
			const next = s[this.i + 1];
			if (c === " " || c === "\t" || c === "\r") { this.i++; continue; }
			if (c === "\\" && next === "\n") { this.i += 2; continue; }
			if (c === "\n") { this.i++; this.endPipeline(); this.readHeredocs(); continue; }
			if (c === "#") { while (this.i < s.length && s[this.i] !== "\n") this.i++; continue; }
			if ((c === "<" || c === ">") && next === "(") {
				this.i += 2;
				const inner = this.readBalanced();
				this.subs.push(inner);
				this.cmd.words.push({ text: "/dev/fd/63", dynamic: true, glob: false, quoted: false, subs: [inner] });
				continue;
			}
			if (c === "&" && next === "&") { this.i += 2; this.endPipeline(); continue; }
			if (c === "|" && next === "|") { this.i += 2; this.endPipeline(); continue; }
			if (c === "|") { this.i += next === "&" ? 2 : 1; this.endCommand(); continue; }
			if (c === ";") { this.i += next === ";" || next === "&" ? 2 : 1; this.endPipeline(); continue; }
			if (c === "&" && next !== ">") { this.i++; this.endPipeline(); continue; }
			if (c === "(" || c === ")") { this.i++; this.endPipeline(); continue; }
			if (c === "&" || c === ">" || c === "<") { this.readRedirect(""); continue; }

			const word = this.readWord();
			if (!word) { this.i++; continue; }
			const after = s[this.i];
			if (/^\d+$/.test(word.text) && !word.quoted && (after === ">" || after === "<")) {
				this.readRedirect(word.text);
				continue;
			}
			this.cmd.words.push(word);
		}
		this.endPipeline();
		this.readHeredocs();
		return { pipelines: this.pipelines, subs: this.subs, error: this.error };
	}

	private endCommand() {
		const cmd = this.cmd;
		if (cmd.words.length || cmd.redirects.length) {
			this.pipeline.push(cmd);
			// Remember plain assignments (`X=/tmp/out; rm -rf $X`) and `export X=...`.
			const words = cmd.words[0]?.text === "export" ? cmd.words.slice(1) : cmd.words;
			if (words.length && words.every((w) => ASSIGNMENT_RE.test(w.text))) {
				for (const w of words) {
					const eq = w.text.indexOf("=");
					const name = w.text.slice(0, eq).replace(/\+$/, "");
					if (w.dynamic) this.vars.delete(name);
					else this.vars.set(name, w.text.slice(eq + 1));
				}
			}
		}
		this.cmd = newCommand();
	}

	private endPipeline() {
		this.endCommand();
		if (this.pipeline.length) this.pipelines.push(this.pipeline);
		this.pipeline = [];
	}

	private readRedirect(fd: string) {
		const s = this.src;
		const ops = ["&>>", "&>", ">>", ">|", ">&", "<<<", "<<-", "<<", "<>", "<&", ">", "<"];
		const op = ops.find((o) => s.startsWith(o, this.i));
		if (!op) { this.i++; return; }
		this.i += op.length;
		while (s[this.i] === " " || s[this.i] === "\t") this.i++;
		if (op === "<<" || op === "<<-") {
			const delim = this.readWord();
			if (!delim) { this.error ??= "missing heredoc delimiter"; return; }
			this.pending.push({ delim: delim.text, strip: op === "<<-", quoted: delim.quoted, cmd: this.cmd });
			this.cmd.redirects.push({ op });
			return;
		}
		const target = this.readWord() ?? undefined;
		if ((op === ">&" || op === "<&") && target && /^(\d+|-)$/.test(target.text)) return;
		this.cmd.redirects.push({ op: fd + op, target });
	}

	private readHeredocs() {
		const s = this.src;
		for (const doc of this.pending) {
			const lines: string[] = [];
			while (this.i < s.length) {
				let end = s.indexOf("\n", this.i);
				if (end < 0) end = s.length;
				const line = s.slice(this.i, end);
				this.i = Math.min(end + 1, s.length);
				if ((doc.strip ? line.replace(/^\t+/, "") : line) === doc.delim) break;
				lines.push(line);
			}
			const body = lines.join("\n");
			doc.cmd.heredocs.push({ body, quoted: doc.quoted });
			if (!doc.quoted) this.collectSubs(body);
		}
		this.pending = [];
	}

	/** Find `$(...)` and backticks in heredoc bodies, which run even though the body is data. */
	private collectSubs(text: string) {
		const inner = new ShellParser(text, this.vars, this.env, this.home);
		while (inner.i < text.length) {
			const c = text[inner.i];
			if (c === "\\") inner.i += 2;
			else if (c === "$" || c === "`") inner.readDollar();
			else inner.i++;
		}
		this.subs.push(...inner.subs);
	}

	private lookup(name: string): string | undefined {
		if (this.vars.has(name)) return this.vars.get(name);
		if (name === "HOME") return this.home;
		return this.env[name];
	}

	readWord(): Word | null {
		const s = this.src;
		const start = this.i;
		let text = "";
		let dynamic = false;
		let glob = false;
		let quoted = false;
		const subs: string[] = [];
		const absorb = (r: { text: string; dynamic: boolean; sub?: string }) => {
			text += r.text;
			dynamic ||= r.dynamic;
			if (r.sub !== undefined) subs.push(r.sub);
		};

		while (this.i < s.length) {
			const c = s[this.i]!;
			if (WORD_BREAK.includes(c)) break;
			if (c === "\\") {
				const n = s[this.i + 1];
				if (n === undefined) { this.i++; break; }
				if (n !== "\n") text += n;
				this.i += 2;
				quoted = true;
				continue;
			}
			if (c === "'") {
				const end = s.indexOf("'", this.i + 1);
				quoted = true;
				if (end < 0) {
					this.error ??= "unterminated single quote";
					text += s.slice(this.i + 1);
					this.i = s.length;
					break;
				}
				text += s.slice(this.i + 1, end);
				this.i = end + 1;
				continue;
			}
			if (c === "$" && s[this.i + 1] === "'") {
				quoted = true;
				this.i += 2;
				while (this.i < s.length && s[this.i] !== "'") {
					if (s[this.i] === "\\" && this.i + 1 < s.length) {
						const e = s[this.i + 1]!;
						text += e === "n" ? "\n" : e === "t" ? "\t" : e;
						this.i += 2;
						continue;
					}
					text += s[this.i];
					this.i++;
				}
				if (this.i >= s.length) this.error ??= "unterminated $'' quote";
				this.i++;
				continue;
			}
			if (c === '"') {
				quoted = true;
				this.i++;
				while (this.i < s.length && s[this.i] !== '"') {
					const d = s[this.i]!;
					if (d === "\\" && '$`"\\\n'.includes(s[this.i + 1] ?? "x")) {
						if (s[this.i + 1] !== "\n") text += s[this.i + 1];
						this.i += 2;
						continue;
					}
					if (d === "$" || d === "`") { absorb(this.readDollar()); continue; }
					text += d;
					this.i++;
				}
				if (this.i >= s.length) this.error ??= "unterminated double quote";
				this.i++;
				continue;
			}
			if (c === "$" || c === "`") { absorb(this.readDollar()); continue; }
			if (c === "~" && !quoted && (text === "" || /^[A-Za-z_][A-Za-z0-9_]*=$/.test(text))) {
				const n = s[this.i + 1];
				if (n === undefined || n === "/" || WORD_BREAK.includes(n)) {
					text += this.home;
					this.i++;
					continue;
				}
			}
			if (c === "*" || c === "?" || c === "[") glob = true;
			text += c;
			this.i++;
		}
		if (this.i === start) return null;
		return { text, dynamic, glob, quoted, subs };
	}

	/** Read `$...` or a backtick substitution at the cursor. */
	readDollar(): { text: string; dynamic: boolean; sub?: string } {
		const s = this.src;
		if (s[this.i] === "`") {
			let j = this.i + 1;
			let inner = "";
			while (j < s.length && s[j] !== "`") {
				if (s[j] === "\\" && j + 1 < s.length) { inner += s[j + 1]; j += 2; continue; }
				inner += s[j];
				j++;
			}
			if (j >= s.length) this.error ??= "unterminated backtick";
			this.i = Math.min(j + 1, s.length);
			this.subs.push(inner);
			return { text: "$__SUB__", dynamic: true, sub: inner };
		}
		const n = s[this.i + 1];
		if (n === "(" && s[this.i + 2] === "(") {
			this.i += 3;
			let depth = 2;
			while (this.i < s.length && depth > 0) {
				if (s[this.i] === "(") depth++;
				else if (s[this.i] === ")") depth--;
				this.i++;
			}
			return { text: "0", dynamic: true };
		}
		if (n === "(") {
			this.i += 2;
			const inner = this.readBalanced();
			this.subs.push(inner);
			return { text: "$__SUB__", dynamic: true, sub: inner };
		}
		if (n === "{") {
			let depth = 0;
			let j = this.i + 1;
			for (; j < s.length; j++) {
				if (s[j] === "{") depth++;
				else if (s[j] === "}" && --depth === 0) break;
			}
			const body = s.slice(this.i + 2, j);
			this.i = Math.min(j + 1, s.length);
			if (NAME_RE.test(body) && NAME_RE.exec(body)![0] === body) {
				const value = this.lookup(body);
				if (value !== undefined) return { text: value, dynamic: false };
			}
			return { text: "${" + body + "}", dynamic: true };
		}
		const name = NAME_RE.exec(s.slice(this.i + 1));
		if (name) {
			this.i += 1 + name[0].length;
			const value = this.lookup(name[0]);
			if (value !== undefined) return { text: value, dynamic: false };
			return { text: "$" + name[0], dynamic: true };
		}
		if (n !== undefined && "@*#?$!-0123456789".includes(n)) {
			this.i += 2;
			return { text: "$" + n, dynamic: true };
		}
		this.i++;
		return { text: "$", dynamic: false };
	}

	/** Read up to the `)` that closes a `$(` or `<(`; heredoc and quote aware. */
	private readBalanced(): string {
		const s = this.src;
		const start = this.i;
		let depth = 1;
		let heredocs: { delim: string; strip: boolean }[] = [];
		while (this.i < s.length) {
			const c = s[this.i]!;
			if (c === "\\") { this.i += 2; continue; }
			if (c === "'") {
				const end = s.indexOf("'", this.i + 1);
				if (end < 0) { this.error ??= "unterminated single quote"; this.i = s.length; break; }
				this.i = end + 1;
				continue;
			}
			if (c === '"') {
				this.i++;
				while (this.i < s.length && s[this.i] !== '"') {
					if (s[this.i] === "\\") this.i += 2;
					else if (s[this.i] === "$" && s[this.i + 1] === "(") { this.i += 2; this.readBalanced(); }
					else this.i++;
				}
				this.i++;
				continue;
			}
			if (c === "#" && (this.i === start || /\s/.test(s[this.i - 1]!))) {
				while (this.i < s.length && s[this.i] !== "\n") this.i++;
				continue;
			}
			if (c === "<" && s[this.i + 1] === "<" && s[this.i + 2] !== "<") {
				let j = this.i + 2;
				const strip = s[j] === "-";
				if (strip) j++;
				while (s[j] === " " || s[j] === "\t") j++;
				let delim = "";
				while (j < s.length && !WORD_BREAK.includes(s[j]!)) {
					if (s[j] !== "'" && s[j] !== '"' && s[j] !== "\\") delim += s[j];
					j++;
				}
				if (delim) heredocs.push({ delim, strip });
				this.i = j;
				continue;
			}
			if (c === "\n" && heredocs.length) {
				this.i++;
				for (const doc of heredocs) {
					while (this.i < s.length) {
						let end = s.indexOf("\n", this.i);
						if (end < 0) end = s.length;
						const line = s.slice(this.i, end);
						this.i = Math.min(end + 1, s.length);
						if ((doc.strip ? line.replace(/^\t+/, "") : line) === doc.delim) break;
					}
				}
				heredocs = [];
				continue;
			}
			if (c === "(") depth++;
			else if (c === ")" && --depth === 0) {
				const inner = s.slice(start, this.i);
				this.i++;
				return inner;
			}
			this.i++;
		}
		this.error ??= "unterminated substitution";
		return s.slice(start);
	}
}

// --- Bash classification ---

interface State {
	cwd: string | null;
	vars: Map<string, string>;
}

class Analysis {
	findings: Finding[] = [];
	readOnly = true;
	readonly policy: Policy;
	constructor(policy: Policy) {
		this.policy = policy;
	}
	add(finding: Finding | undefined) {
		if (!finding) return;
		if (finding.level === "ask" && this.policy.disabledRules.has(finding.rule)) return;
		if (this.findings.some((f) => f.rule === finding.rule && f.reason === finding.reason)) return;
		this.findings.push(finding);
	}
	ask(rule: string, reason: string, extra: Partial<Finding> = {}) {
		this.add({ level: "ask", rule, reason, ...extra });
	}
	block(rule: string, reason: string, catastrophic = false) {
		this.add({ level: "block", rule, reason, catastrophic });
	}
}

/** Classify a bash command. `cwd` is where the command will run. */
export function classifyCommand(policy: Policy, command: string, cwd: string): Verdict {
	const out = new Analysis(policy);
	rawChecks(policy, command, out);
	analyzeSource(policy, command, { cwd, vars: new Map() }, 0, out);
	const level: Level = out.findings.some((f) => f.level === "block")
		? "block"
		: out.findings.some((f) => f.level === "ask")
			? "ask"
			: "allow";
	return { level, findings: out.findings, readOnly: out.readOnly && level === "allow" };
}

function escapeRegex(text: string): string {
	return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Checks on the raw text: fork bombs, custom patterns, and secret paths in any spelling. */
function rawChecks(policy: Policy, command: string, out: Analysis) {
	if (/:\s*\(\s*\)\s*\{[^}]*:\s*\|\s*:\s*&/.test(command)) out.block("fork-bomb", "fork bomb", true);
	for (const p of policy.blockPatterns) if (p.regex.test(command)) out.block("custom-block", p.description);
	for (const p of policy.askPatterns) if (p.regex.test(command)) out.ask("custom-ask", p.description);

	const flags = policy.caseInsensitive ? "i" : "";
	for (const secret of policy.secretPaths) {
		const spellings = [secret];
		if (within(policy, secret, policy.home)) {
			const rest = secret.slice(policy.home.length);
			spellings.push(`~${rest}`, `$HOME${rest}`, `\${HOME}${rest}`);
		}
		const regex = new RegExp(`(?:${spellings.map(escapeRegex).join("|")})(?=$|[/\\s'"\`;|&)<>:,])`, flags);
		if (regex.test(command)) {
			out.block("secret-path", `secret path ${displayPath(policy, secret)}`);
			out.readOnly = false;
		}
	}
}

function analyzeSource(policy: Policy, source: string, state: State, depth: number, out: Analysis) {
	if (depth > 6) {
		out.ask("nesting", "command nests shells too deeply to analyze");
		out.readOnly = false;
		return;
	}
	const parser = new ShellParser(source, state.vars, policy.env, policy.home);
	const parsed = parser.parse();
	if (parsed.error) {
		out.ask("unparseable", `could not parse the command (${parsed.error})`);
		out.readOnly = false;
	}
	for (const pipeline of parsed.pipelines) analyzePipeline(policy, pipeline, state, depth, out);
	for (const sub of parsed.subs) analyzeSource(policy, sub, { cwd: state.cwd, vars: state.vars }, depth + 1, out);
}

const DOWNLOADERS = new Set(["curl", "wget", "fetch", "http", "https", "xh", "aria2c"]);
const INTERPRETERS = new Set([
	"sh", "bash", "zsh", "dash", "ksh", "fish", "python", "python3", "node", "ruby", "perl", "php", "deno", "bun",
	"source", ".", "osascript",
]);
const SHELLS = new Set(["sh", "bash", "zsh", "dash", "ksh", "fish"]);
const DOWNLOAD_TEXT = /(^|[\s;&|(])(curl|wget|fetch|xh|aria2c)\s/;

function analyzePipeline(policy: Policy, pipeline: Command[], state: State, depth: number, out: Analysis) {
	let downloaded = false;
	for (const cmd of pipeline) {
		const name = analyzeSimple(policy, cmd, state, depth, out, downloaded);
		if (name && DOWNLOADERS.has(name)) downloaded = true;
	}
}

function commandName(word: Word): string {
	return basename(word.text);
}

function isFlag(word: Word | undefined): boolean {
	return !!word && word.text.startsWith("-") && word.text !== "-";
}

/** Collect short flag letters and long flags until `--`. */
function flagSet(args: Word[]): Set<string> {
	const flags = new Set<string>();
	for (const a of args) {
		const t = a.text;
		if (t === "--") break;
		if (t.startsWith("--")) flags.add(t.split("=")[0]!);
		else if (t.startsWith("-") && t.length > 1) for (const ch of t.slice(1)) flags.add("-" + ch);
	}
	return flags;
}

/** Positional arguments, skipping options (and their values for `withValue`). */
function positionals(args: Word[], withValue: Set<string> = new Set()): Word[] {
	const result: Word[] = [];
	let afterDashes = false;
	for (let i = 0; i < args.length; i++) {
		const a = args[i]!;
		if (afterDashes) { result.push(a); continue; }
		if (a.text === "--") { afterDashes = true; continue; }
		if (isFlag(a)) {
			if (withValue.has(a.text)) i++;
			continue;
		}
		result.push(a);
	}
	return result;
}

function skipOptions(words: Word[], withValue: Set<string>): Word[] {
	let i = 0;
	while (i < words.length && isFlag(words[i])) {
		const t = words[i]!.text;
		i++;
		if (t === "--") break;
		if (withValue.has(t)) i++;
	}
	return words.slice(i);
}

const KEYWORDS = new Set(["!", "if", "then", "else", "elif", "fi", "do", "done", "while", "until", "{", "}", "esac", "in"]);

interface Wrappers {
	sudo: boolean;
	xargs: boolean;
}

/** Drop assignments, keywords, and wrappers such as sudo, env, xargs, timeout. */
function unwrap(words: Word[], wrappers: Wrappers): Word[] {
	let w = words;
	for (let guard = 0; guard < 20 && w.length; guard++) {
		const first = w[0]!;
		if (ASSIGNMENT_RE.test(first.text)) { w = w.slice(1); continue; }
		if (KEYWORDS.has(first.text)) { w = w.slice(1); continue; }
		switch (commandName(first)) {
			case "sudo":
			case "doas":
				wrappers.sudo = true;
				w = skipOptions(w.slice(1), new Set(["-u", "-g", "-p", "-C", "-D", "-r", "-t", "-U", "-h", "-T"]));
				continue;
			case "env":
				w = w.slice(1);
				while (w.length && (isFlag(w[0]) || ASSIGNMENT_RE.test(w[0]!.text))) {
					const t = w[0]!.text;
					w = w.slice(1);
					if (t === "-u" || t === "-C" || t === "-P") w = w.slice(1);
				}
				continue;
			case "command":
			case "builtin":
				if (w[1] && /^-[vV]$/.test(w[1].text)) return w; // `command -v` is a lookup
				w = skipOptions(w.slice(1), new Set());
				continue;
			case "exec":
				w = skipOptions(w.slice(1), new Set(["-a"]));
				continue;
			case "nohup":
			case "unbuffer":
			case "chronic":
			case "noglob":
				w = w.slice(1);
				continue;
			case "time":
				w = skipOptions(w.slice(1), new Set());
				continue;
			case "nice":
				w = skipOptions(w.slice(1), new Set(["-n"]));
				continue;
			case "ionice":
				w = skipOptions(w.slice(1), new Set(["-c", "-n", "-p"]));
				continue;
			case "stdbuf":
				w = skipOptions(w.slice(1), new Set(["-i", "-o", "-e"]));
				continue;
			case "caffeinate":
				w = skipOptions(w.slice(1), new Set(["-t", "-w"]));
				continue;
			case "timeout":
			case "gtimeout":
				w = skipOptions(w.slice(1), new Set(["-s", "-k", "--signal", "--kill-after"])).slice(1);
				continue;
			case "xargs":
				wrappers.xargs = true;
				w = skipOptions(w.slice(1), new Set(["-I", "-L", "-n", "-P", "-s", "-d", "-E", "-a", "-J", "-R", "-S"]));
				continue;
		}
		break;
	}
	return w;
}

/** Resolve a word to an absolute path, or null when it depends on unknown values. */
function wordPath(policy: Policy, word: Word, state: State): string | null {
	if (word.dynamic || !word.text) return null;
	if (!isAbsolute(word.text) && state.cwd === null) return null;
	return normalizePath(word.text, state.cwd ?? "/");
}

function looksLikePath(text: string): boolean {
	return text.startsWith("/") || text.startsWith(".") || text.includes("/");
}

/** Block any argument that names a secret path, including `--opt=path` values. */
function checkSecretArgs(policy: Policy, words: Word[], state: State, out: Analysis) {
	for (const word of words) {
		const candidates = [word.text];
		const eq = word.text.indexOf("=");
		if (eq > 0) candidates.push(word.text.slice(eq + 1));
		for (const text of candidates) {
			if (word.dynamic || !looksLikePath(text)) continue;
			if (!isAbsolute(text) && state.cwd === null) continue;
			const secret = findSecret(policy, normalizePath(text, state.cwd ?? "/"));
			if (secret) out.block("secret-path", `secret path ${displayPath(policy, secret)}`);
		}
	}
}

type DeleteKind = "recursive" | "single" | "find-match";

/** Classify deleting `word` (or, for globs, the entries it matches). */
function deleteFinding(policy: Policy, word: Word, state: State, kind: DeleteKind, tool: string): Finding | undefined {
	let text = word.text;
	let scope: "path" | "all" | "some" = "path";
	if (word.glob && !word.dynamic) {
		const parts = text.split("/");
		const idx = parts.findIndex((p) => /[*?[]/.test(p));
		text = parts.slice(0, idx).join("/") || (text.startsWith("/") ? "/" : ".");
		scope = idx === parts.length - 1 && /^(\*|\.\*|\*\.\*|\*\*)$/.test(parts[idx]!) ? "all" : "some";
	}
	if (scope === "some") kind = "find-match";
	const path = wordPath(policy, { ...word, text, glob: false }, state);
	if (path === null) {
		if (kind === "single") return undefined;
		return { level: "ask", rule: "delete-unknown", reason: `${tool} with a target that depends on variables: ${word.text}` };
	}
	const shown = scope === "path" ? displayPath(policy, path) : join(displayPath(policy, path), word.text.split("/").pop()!);
	const secret = findSecret(policy, path);
	if (secret) return { level: "block", rule: "secret-path", reason: `${tool} touches secret path ${displayPath(policy, secret)}` };

	const temp = policy.tempRoots.find((t) => within(policy, path, t));
	if (temp) {
		if (same(policy, path, temp) && scope === "path" && kind === "recursive") {
			return { level: "ask", rule: "delete-outside-project", reason: `${tool} ${shown}` };
		}
		return undefined;
	}

	// "wide" deletes remove a whole tree, or everything in a folder.
	const wide = kind !== "single" || scope === "all";
	if (wide && isCriticalPath(policy, path)) {
		if (kind === "find-match") return { level: "ask", rule: "delete-outside-project", reason: `${tool} under ${shown}` };
		return { level: "block", rule: "delete-critical", reason: `${tool} ${shown}`, catastrophic: true };
	}
	const innerSecret = wide ? policy.secretPaths.find((s) => within(policy, s, path)) : undefined;
	if (innerSecret) return { level: "block", rule: "secret-path", reason: `${tool} ${shown} would delete secret path ${displayPath(policy, innerSecret)}` };

	const guarded = findWriteProtected(policy, path);
	const root = policy.projectRoots.find((r) => within(policy, path, r));
	if (root) {
		if (guarded) return { level: "ask", rule: "protected-write", reason: `${tool} touches protected path ${displayPath(policy, guarded)}` };
		if (kind === "find-match") return undefined;
		if (same(policy, path, root) && wide) {
			return { level: "ask", rule: "delete-project", reason: `${tool} ${shown} (the whole project)` };
		}
		if (same(policy, path, join(root, ".git")) && kind === "recursive") {
			return { level: "ask", rule: "delete-git-dir", reason: `${tool} ${shown} (repository history)` };
		}
		return undefined;
	}
	const innerGuarded = guarded ?? (wide ? policy.writeProtectedPaths.find((p) => within(policy, p, path)) : undefined);
	if (innerGuarded) return { level: "ask", rule: "protected-write", reason: `${tool} touches protected path ${displayPath(policy, innerGuarded)}` };
	if (wide && policy.projectRoots.some((r) => within(policy, r, path))) {
		return { level: "ask", rule: "delete-project", reason: `${tool} ${shown} (contains the project)` };
	}
	if (isSystemPath(policy, path)) return { level: "ask", rule: "system-write", reason: `${tool} ${shown} (system path)` };
	if (!wide) return undefined; // deleting one file outside the project is not worth a prompt
	return { level: "ask", rule: "delete-outside-project", reason: `${tool} ${shown} (outside the project)` };
}

function writeFinding(policy: Policy, word: Word, state: State): Finding | undefined {
	const path = wordPath(policy, word, state);
	if (path === null) return undefined;
	return writeTargetFinding(policy, path);
}

const WRITE_REDIRECTS = /^\d*(>|>>|>\||&>|&>>|<>|>&)$/;

/** Analyze one simple command. Returns its command name for pipeline checks. */
function analyzeSimple(
	policy: Policy,
	cmd: Command,
	state: State,
	depth: number,
	out: Analysis,
	downloadedInput: boolean,
): string | undefined {
	if (state.cwd !== null) {
		const secret = findSecret(policy, state.cwd);
		if (secret) out.block("secret-path", `working directory is inside secret path ${displayPath(policy, secret)}`);
	}

	for (const r of cmd.redirects) {
		if (!r.target) continue;
		if (WRITE_REDIRECTS.test(r.op)) {
			const path = wordPath(policy, r.target, state);
			if (path === null || !HARMLESS_DEVICES.test(path)) out.readOnly = false;
			out.add(writeFinding(policy, r.target, state));
		}
		checkSecretArgs(policy, [r.target], state, out);
	}

	const wrappers: Wrappers = { sudo: false, xargs: false };
	checkSecretArgs(policy, cmd.words, state, out);
	const words = unwrap(cmd.words, wrappers);
	if (wrappers.sudo) out.ask("sudo", "runs with sudo");
	if (!words.length) return undefined;

	const first = words[0]!;
	if (first.dynamic) {
		out.readOnly = false;
		return undefined;
	}
	const name = commandName(first);
	const args = words.slice(1);
	if (!policy.readOnlyCommands.has(name)) out.readOnly = false;

	const ctx: RuleContext = { policy, state, depth, out, name, args, cmd, wrappers, downloadedInput };
	const rule = Object.hasOwn(RULES, name) ? RULES[name] : /^(mkfs|newfs)(\.|_|$)/.test(name) ? RULES.mkfs : undefined;
	rule?.(ctx);
	if (INTERPRETERS.has(name)) interpreterRule(ctx);
	return name;
}

interface RuleContext {
	policy: Policy;
	state: State;
	depth: number;
	out: Analysis;
	name: string;
	args: Word[];
	cmd: Command;
	wrappers: Wrappers;
	downloadedInput: boolean;
}

type Rule = (ctx: RuleContext) => void;

function deleteRule(ctx: RuleContext, recursiveFlags: string[]) {
	const flags = flagSet(ctx.args);
	const recursive = recursiveFlags.some((f) => flags.has(f));
	const targets = positionals(ctx.args);
	if (ctx.wrappers.xargs) {
		const unknown: Word = { text: "$XARGS", dynamic: true, glob: false, quoted: false, subs: [] };
		ctx.out.add(deleteFinding(ctx.policy, unknown, ctx.state, recursive ? "recursive" : "single", ctx.name));
	}
	for (const target of targets) {
		ctx.out.add(deleteFinding(ctx.policy, target, ctx.state, recursive ? "recursive" : "single", ctx.name));
	}
}

function recursiveModeRule(ctx: RuleContext, valueArgs: number) {
	const flags = flagSet(ctx.args);
	const pos = positionals(ctx.args).slice(valueArgs);
	const recursive = flags.has("-R") || flags.has("--recursive");
	for (const target of pos) {
		const path = wordPath(ctx.policy, target, ctx.state);
		if (path === null) continue;
		if (isCriticalPath(ctx.policy, path)) {
			if (recursive) ctx.out.block("permissions-critical", `${ctx.name} -R ${displayPath(ctx.policy, path)}`, true);
			else ctx.out.ask("permissions-critical", `${ctx.name} ${displayPath(ctx.policy, path)}`);
			continue;
		}
		const inProject = ctx.policy.projectRoots.some((r) => within(ctx.policy, path, r));
		const inTemp = ctx.policy.tempRoots.some((t) => within(ctx.policy, path, t));
		if (recursive && !inProject && !inTemp) {
			ctx.out.ask("permissions-outside-project", `${ctx.name} -R ${displayPath(ctx.policy, path)} (outside the project)`);
		}
		ctx.out.add(writeTargetFinding(ctx.policy, path));
	}
}

function lastArgWriteRule(ctx: RuleContext, withValue: string[] = []) {
	const flags = flagSet(ctx.args);
	const pos = positionals(ctx.args, new Set(withValue));
	const targetDir = ctx.args.findIndex((a) => a.text === "-t" || a.text === "--target-directory");
	const dest = targetDir >= 0 ? ctx.args[targetDir + 1] : pos[pos.length - 1];
	if (dest && pos.length >= (targetDir >= 0 ? 1 : 2)) ctx.out.add(writeFinding(ctx.policy, dest, ctx.state));
	return { flags, pos, dest };
}

function gitRule(ctx: RuleContext) {
	const { args, out } = ctx;
	let i = 0;
	let cwd = ctx.state.cwd;
	while (i < args.length && isFlag(args[i])) {
		const t = args[i]!.text;
		if (t === "-C") {
			const p = args[i + 1];
			cwd = p && !p.dynamic ? (isAbsolute(p.text) ? p.text : cwd ? resolve(cwd, p.text) : null) : null;
			i += 2;
			continue;
		}
		i += ["-c", "--git-dir", "--work-tree", "--namespace"].includes(t) ? 2 : 1;
	}
	const sub = args[i]?.text;
	const rest = args.slice(i + 1);
	const texts = rest.map((a) => a.text);
	const flags = flagSet(rest);
	const pos = positionals(rest);
	const dirty = (paths: string[] = []) => (cwd ? { dirtyCheck: { cwd, paths } } : {});
	const pathspecs = () => {
		const dashes = texts.indexOf("--");
		return dashes >= 0 ? texts.slice(dashes + 1) : pos.map((p) => p.text);
	};

	const READ_ONLY_SUBCOMMANDS = new Set([
		"status", "log", "diff", "show", "blame", "rev-parse", "ls-files", "ls-tree", "ls-remote", "describe",
		"shortlog", "grep", "cat-file", "rev-list", "merge-base", "whatchanged", "name-rev", "show-ref",
		"for-each-ref", "count-objects", "check-ignore", "var", "version", "help", "fetch",
	]);
	let readOnly = sub !== undefined && READ_ONLY_SUBCOMMANDS.has(sub);
	if (sub === "branch") readOnly = pos.length === 0 && !["-d", "-D", "-m", "-M", "-c", "-C", "--delete", "--move", "--copy", "-u", "--set-upstream-to", "--unset-upstream"].some((f) => flags.has(f));
	if (sub === "remote") readOnly = pos.length === 0 || ["get-url", "show"].includes(pos[0]!.text);
	if (sub === "config") readOnly = ["--get", "--get-all", "--get-regexp", "--list", "-l"].some((f) => flags.has(f));
	if (sub === "stash") readOnly = ["list", "show"].includes(pos[0]?.text ?? "");
	if (sub === "tag") readOnly = pos.length === 0 || flags.has("-l") || flags.has("--list");
	if (sub === "worktree") readOnly = pos[0]?.text === "list";
	if (sub === "reflog") readOnly = !pos[0] || pos[0].text === "show";
	if (!readOnly) out.readOnly = false;

	switch (sub) {
		case "push": {
			const forced = texts.some((t) =>
				t === "--force" || t.startsWith("--force-with-lease") || t === "--mirror" || t === "--delete" ||
				t === "--prune" || (/^-[a-zA-Z]+$/.test(t) && /[fd]/.test(t)),
			);
			const destructiveRef = pos.slice(1).some((p) => p.text.startsWith("+") || p.text.startsWith(":"));
			if (forced || destructiveRef) out.ask("git-force-push", "force or deleting git push (rewrites remote history)");
			break;
		}
		case "reset":
			if (flags.has("--hard") || flags.has("--merge")) out.ask("git-discard", "git reset --hard discards uncommitted changes", dirty());
			break;
		case "checkout": {
			const paths = pathspecs();
			if (flags.has("-f") || flags.has("--force")) out.ask("git-discard", "git checkout --force discards uncommitted changes", dirty());
			else if (texts.includes("--") || texts.includes(".") || texts.includes(":/")) {
				out.ask("git-discard", `git checkout discards uncommitted changes in ${paths.join(" ") || "."}`, dirty(paths));
			}
			break;
		}
		case "restore": {
			const worktree = !(flags.has("--staged") || flags.has("-S")) || flags.has("--worktree") || flags.has("-W");
			if (worktree) out.ask("git-discard", `git restore discards uncommitted changes in ${pathspecs().join(" ") || "."}`, dirty(pathspecs()));
			break;
		}
		case "switch":
			if (flags.has("--discard-changes") || flags.has("-f") || flags.has("--force")) out.ask("git-discard", "git switch --discard-changes", dirty());
			break;
		case "clean":
			if ((flags.has("-f") || flags.has("--force")) && !(flags.has("-n") || flags.has("--dry-run"))) {
				out.ask("git-clean", "git clean deletes untracked files", dirty(pathspecs()));
			}
			break;
		case "stash":
			if (["drop", "clear"].includes(pos[0]?.text ?? "")) out.ask("git-stash-drop", `git stash ${pos[0]!.text} deletes stashed work`);
			break;
		case "branch":
			if (flags.has("-D") || ((flags.has("-d") || flags.has("--delete")) && (flags.has("-f") || flags.has("--force")))) {
				out.ask("git-branch-force-delete", "git branch -D deletes an unmerged branch");
			}
			break;
		case "worktree":
			if (pos[0]?.text === "remove" && (flags.has("-f") || flags.has("--force"))) out.ask("git-discard", "git worktree remove --force");
			break;
		case "filter-branch":
		case "filter-repo":
			out.ask("git-history-rewrite", `git ${sub} rewrites repository history`);
			break;
		case "reflog":
			if (["expire", "delete"].includes(pos[0]?.text ?? "")) out.ask("git-history-rewrite", `git reflog ${pos[0]!.text} removes recovery points`);
			break;
		case "gc":
			if (texts.some((t) => t.startsWith("--prune=now") || t === "--prune=all")) out.ask("git-history-rewrite", "git gc --prune=now removes recovery points");
			break;
		case "update-ref":
			if (flags.has("-d")) out.ask("git-history-rewrite", "git update-ref -d deletes a ref");
			break;
	}
}

function interpreterRule(ctx: RuleContext) {
	const { name, args, out, policy, state, depth } = ctx;
	const fromDownload = args.some((a) => a.subs.some((s) => DOWNLOAD_TEXT.test(" " + s)));
	const readsStdin = !positionals(args).length || args.some((a) => a.text === "-" || a.text === "-s");
	if (fromDownload || (ctx.downloadedInput && readsStdin && name !== "source" && name !== ".")) {
		out.ask("download-exec", `runs a downloaded script with ${name}`);
	}
	if (SHELLS.has(name)) {
		const c = args.findIndex((a) => a.text === "-c" || /^-[a-zA-Z]*c[a-zA-Z]*$/.test(a.text));
		const script = c >= 0 ? args[c + 1] : undefined;
		if (script) analyzeSource(policy, script.text, { cwd: state.cwd, vars: state.vars }, depth + 1, out);
		for (const doc of ctx.cmd.heredocs) analyzeSource(policy, doc.body, { cwd: state.cwd, vars: state.vars }, depth + 1, out);
	}
}

const ask = (rule: string, reason: string): Rule => (ctx) => ctx.out.ask(rule, reason);

const RULES: Record<string, Rule> = {
	rm: (ctx) => deleteRule(ctx, ["-r", "-R", "--recursive"]),
	unlink: (ctx) => deleteRule(ctx, []),
	shred: (ctx) => {
		for (const t of positionals(ctx.args, new Set(["-n", "-s"]))) ctx.out.ask("shred", `shred ${t.text} (unrecoverable)`);
	},
	srm: (ctx) => deleteRule(ctx, ["-r", "-R", "--recursive"]),
	truncate: (ctx) => {
		for (const t of positionals(ctx.args, new Set(["-s", "-r", "--size", "--reference"]))) {
			ctx.out.add(writeFinding(ctx.policy, t, ctx.state));
		}
	},
	find: (ctx) => {
		const texts = ctx.args.map((a) => a.text);
		const firstExpr = ctx.args.findIndex((a) => a.text.startsWith("-") || a.text === "(" || a.text === "!");
		const roots = (firstExpr < 0 ? ctx.args : ctx.args.slice(0, firstExpr)).filter((a) => !/^-[HLP]$/.test(a.text));
		const rootWords = roots.length ? roots : [{ text: ".", dynamic: false, glob: false, quoted: false, subs: [] }];
		const writes = ["-delete", "-exec", "-execdir", "-ok", "-okdir", "-fprint", "-fprint0", "-fprintf", "-fls"];
		if (texts.some((t) => writes.includes(t))) ctx.out.readOnly = false;
		if (texts.includes("-delete")) {
			for (const r of rootWords) ctx.out.add(deleteFinding(ctx.policy, r, ctx.state, "find-match", "find -delete"));
		}
		for (let i = 0; i < ctx.args.length; i++) {
			if (!["-exec", "-execdir", "-ok", "-okdir"].includes(texts[i]!)) continue;
			let end = i + 1;
			while (end < texts.length && texts[end] !== ";" && texts[end] !== "+") end++;
			const inner = ctx.args.slice(i + 1, end);
			i = end;
			if (!inner.length) continue;
			const innerName = commandName(inner[0]!);
			if (innerName === "rm" || innerName === "unlink" || innerName === "shred") {
				if (innerName === "shred") ctx.out.ask("shred", "find -exec shred (unrecoverable)");
				for (const r of rootWords) {
					ctx.out.add(deleteFinding(ctx.policy, r, ctx.state, "find-match", `find -exec ${innerName}`));
				}
			} else {
				const placeholder = inner.map((w) => (w.text === "{}" ? { ...w, dynamic: true } : w));
				analyzeSimple(ctx.policy, { words: placeholder, redirects: [], heredocs: [] }, ctx.state, ctx.depth + 1, ctx.out, false);
			}
		}
	},
	sed: (ctx) => {
		const inPlace = ctx.args.some((a) => /^-[a-zA-Z]*i/.test(a.text) || a.text.startsWith("--in-place"));
		if (!inPlace) return;
		ctx.out.readOnly = false;
		const hasScriptFlag = ctx.args.some((a) => a.text === "-e" || a.text === "-f" || a.text.startsWith("--expression"));
		const files = positionals(ctx.args, new Set(["-e", "-f"])).slice(hasScriptFlag ? 0 : 1);
		for (const f of files) ctx.out.add(writeFinding(ctx.policy, f, ctx.state));
	},
	awk: (ctx) => awkRule(ctx),
	gawk: (ctx) => awkRule(ctx),
	tee: (ctx) => {
		const files = positionals(ctx.args);
		if (files.length) ctx.out.readOnly = false;
		for (const f of files) ctx.out.add(writeFinding(ctx.policy, f, ctx.state));
	},
	touch: (ctx) => {
		for (const f of positionals(ctx.args, new Set(["-r", "-t", "-d"]))) ctx.out.add(writeFinding(ctx.policy, f, ctx.state));
	},
	cp: (ctx) => void lastArgWriteRule(ctx),
	install: (ctx) => void lastArgWriteRule(ctx, ["-m", "-o", "-g"]),
	ln: (ctx) => void lastArgWriteRule(ctx),
	mv: (ctx) => {
		const { pos } = lastArgWriteRule(ctx);
		for (const source of pos.slice(0, -1)) {
			const path = wordPath(ctx.policy, source, ctx.state);
			if (path && isCriticalPath(ctx.policy, path)) ctx.out.block("delete-critical", `mv ${displayPath(ctx.policy, path)}`, true);
		}
	},
	rsync: (ctx) => {
		const { flags, dest } = lastArgWriteRule(ctx, ["-e", "--rsh"]);
		if (dest && [...flags].some((f) => f.startsWith("--delete") || f === "--remove-source-files")) {
			ctx.out.add(deleteFinding(ctx.policy, dest, ctx.state, "find-match", "rsync --delete into"));
		}
	},
	dd: (ctx) => {
		for (const a of ctx.args) {
			if (!a.text.startsWith("of=")) continue;
			ctx.out.add(writeFinding(ctx.policy, { ...a, text: a.text.slice(3) }, ctx.state));
		}
	},
	chmod: (ctx) => recursiveModeRule(ctx, 1),
	chown: (ctx) => recursiveModeRule(ctx, 1),
	chgrp: (ctx) => recursiveModeRule(ctx, 1),
	chflags: (ctx) => recursiveModeRule(ctx, 1),
	cd: (ctx) => {
		const target = positionals(ctx.args)[0];
		if (!target) ctx.state.cwd = ctx.policy.home;
		else if (target.text === "-") ctx.state.cwd = null;
		else ctx.state.cwd = wordPath(ctx.policy, target, ctx.state);
	},
	pushd: (ctx) => RULES.cd!(ctx),
	popd: (ctx) => { ctx.state.cwd = null; },
	git: gitRule,
	eval: (ctx) => {
		if (ctx.args.some((a) => a.subs.some((s) => DOWNLOAD_TEXT.test(" " + s)))) ctx.out.ask("download-exec", "eval of a downloaded script");
		analyzeSource(ctx.policy, ctx.args.map((a) => a.text).join(" "), ctx.state, ctx.depth + 1, ctx.out);
	},
	watch: (ctx) => {
		const pos = positionals(ctx.args, new Set(["-n", "--interval", "-d"]));
		if (pos.length) analyzeSource(ctx.policy, pos.map((a) => a.text).join(" "), ctx.state, ctx.depth + 1, ctx.out);
	},
	kill: (ctx) => {
		const targets = ctx.args.filter((a, i) => !(i === 0 && /^-/.test(a.text)) && a.text !== "-s" && a.text !== "-n");
		if (targets.some((t) => t.text === "-1" || t.text === "1")) ctx.out.block("kill-all", "kill -1 / kill 1 terminates every process", true);
	},
	// Machine-level destruction.
	mkfs: (ctx) => ctx.out.block("format-disk", "formats a filesystem", true),
	newfs: (ctx) => ctx.out.block("format-disk", "formats a filesystem", true),
	fdisk: (ctx) => ctx.out.block("format-disk", "edits disk partitions", true),
	diskutil: (ctx) => {
		const sub = positionals(ctx.args)[0]?.text ?? "";
		const second = positionals(ctx.args)[1]?.text ?? "";
		if (/^(erase|zero|secureErase|partitionDisk|reformat|randomDisk)/i.test(sub) || (sub === "apfs" && /^(delete|erase)/i.test(second))) {
			ctx.out.block("format-disk", `diskutil ${sub} ${second}`.trim(), true);
		}
	},
	shutdown: (ctx) => ctx.out.block("power", "shuts the machine down", true),
	reboot: (ctx) => ctx.out.block("power", "reboots the machine", true),
	halt: (ctx) => ctx.out.block("power", "halts the machine", true),
	poweroff: (ctx) => ctx.out.block("power", "powers the machine off", true),
	init: (ctx) => {
		if (["0", "6"].includes(ctx.args[0]?.text ?? "")) ctx.out.block("power", `init ${ctx.args[0]!.text}`, true);
	},
	systemctl: (ctx) => {
		if (["poweroff", "reboot", "halt"].includes(positionals(ctx.args)[0]?.text ?? "")) ctx.out.block("power", "systemctl power action", true);
	},
	csrutil: ask("system-security", "changes System Integrity Protection"),
	spctl: (ctx) => {
		if (ctx.args.some((a) => /disable/.test(a.text))) ctx.out.ask("system-security", "disables Gatekeeper");
	},
	nvram: ask("system-security", "changes firmware variables"),
	security: (ctx) => {
		const sub = positionals(ctx.args)[0]?.text ?? "";
		if (/^(dump-keychain|export)/.test(sub) || (/^find-.*password$/.test(sub) && ctx.args.some((a) => /^-[a-zA-Z]*[wg]/.test(a.text)))) {
			ctx.out.block("secret-path", `security ${sub} reads keychain secrets`);
		} else if (/^delete-/.test(sub)) {
			ctx.out.ask("keychain-delete", `security ${sub}`);
		}
	},
	defaults: (ctx) => {
		if (positionals(ctx.args)[0]?.text === "delete") ctx.out.ask("macos-defaults-delete", "defaults delete");
	},
	launchctl: (ctx) => {
		const sub = positionals(ctx.args)[0]?.text ?? "";
		if (["bootout", "unload", "remove", "disable"].includes(sub)) ctx.out.ask("launchctl", `launchctl ${sub}`);
	},
	tmutil: (ctx) => {
		if (/^delete/.test(positionals(ctx.args)[0]?.text ?? "")) ctx.out.ask("backup-delete", "deletes Time Machine backups");
	},
	crontab: (ctx) => {
		if (flagSet(ctx.args).has("-r")) ctx.out.ask("crontab-remove", "crontab -r removes all cron jobs");
	},
	// Remote and irreversible services.
	gh: (ctx) => {
		const pos = positionals(ctx.args, new Set(["-R", "--repo", "-X", "--method"]));
		const [area, action] = [pos[0]?.text, pos[1]?.text];
		const method = ctx.args.findIndex((a) => a.text === "-X" || a.text === "--method");
		if (action === "delete" || (area === "api" && /^delete$/i.test(ctx.args[method + 1]?.text ?? ""))) {
			ctx.out.ask("remote-delete", `gh ${area} delete`);
		}
	},
	docker: (ctx) => containerRule(ctx),
	podman: (ctx) => containerRule(ctx),
	kubectl: (ctx) => {
		const sub = positionals(ctx.args, new Set(["-n", "--namespace", "--context", "-f", "-l"]))[0]?.text ?? "";
		if (["delete", "drain"].includes(sub) || (sub === "replace" && flagSet(ctx.args).has("--force"))) ctx.out.ask("cluster-delete", `kubectl ${sub}`);
	},
	helm: (ctx) => {
		if (["uninstall", "delete"].includes(positionals(ctx.args)[0]?.text ?? "")) ctx.out.ask("cluster-delete", "helm uninstall");
	},
	terraform: (ctx) => terraformRule(ctx),
	tofu: (ctx) => terraformRule(ctx),
	terragrunt: (ctx) => terraformRule(ctx),
	aws: (ctx) => {
		const pos = positionals(ctx.args, new Set(["--profile", "--region", "--output", "--query"])).map((p) => p.text);
		if ((pos[0] === "s3" && ["rm", "rb"].includes(pos[1] ?? "")) || pos.some((p) => /^(delete|terminate|remove)-/.test(p))) {
			ctx.out.ask("cloud-delete", `aws ${pos.slice(0, 2).join(" ")}`);
		}
	},
	gcloud: (ctx) => {
		if (positionals(ctx.args).some((p) => p.text === "delete")) ctx.out.ask("cloud-delete", "gcloud delete");
	},
	az: (ctx) => {
		if (positionals(ctx.args).some((p) => p.text === "delete")) ctx.out.ask("cloud-delete", "az delete");
	},
	dropdb: ask("database-drop", "drops a database"),
	psql: (ctx) => sqlRule(ctx),
	mysql: (ctx) => sqlRule(ctx),
	sqlite3: (ctx) => sqlRule(ctx),
	mongosh: (ctx) => sqlRule(ctx),
	"redis-cli": (ctx) => {
		if (ctx.args.some((a) => /^flush(all|db)$/i.test(a.text))) ctx.out.ask("database-drop", "redis flush");
	},
	npm: (ctx) => publishRule(ctx, ["publish", "unpublish", "deprecate"]),
	pnpm: (ctx) => publishRule(ctx, ["publish"]),
	yarn: (ctx) => publishRule(ctx, ["publish", "npm"]),
	bun: (ctx) => publishRule(ctx, ["publish"]),
	cargo: (ctx) => publishRule(ctx, ["publish", "yank"]),
	gem: (ctx) => publishRule(ctx, ["push", "yank"]),
	twine: (ctx) => publishRule(ctx, ["upload"]),
	poetry: (ctx) => publishRule(ctx, ["publish"]),
	uv: (ctx) => publishRule(ctx, ["publish"]),
	vsce: (ctx) => publishRule(ctx, ["publish", "unpublish"]),
};

function awkRule(ctx: RuleContext) {
	const script = positionals(ctx.args, new Set(["-F", "-v", "-f"]))[0]?.text ?? "";
	if (/\bsystem\s*\(|\|\s*getline|"\s*\||print[f]?[^;}]*>\s*"/.test(script)) ctx.out.readOnly = false;
}

function containerRule(ctx: RuleContext) {
	const pos = positionals(ctx.args).map((p) => p.text);
	const flags = flagSet(ctx.args);
	if (pos[0] === "volume" && ["rm", "prune"].includes(pos[1] ?? "")) ctx.out.ask("container-data", `${ctx.name} volume ${pos[1]}`);
	if (pos[0] === "system" && pos[1] === "prune" && flags.has("--volumes")) ctx.out.ask("container-data", `${ctx.name} system prune --volumes`);
	if (pos.includes("down") && (flags.has("-v") || flags.has("--volumes"))) ctx.out.ask("container-data", `${ctx.name} compose down --volumes`);
	if (pos[0] === "push") ctx.out.ask("publish", `${ctx.name} push`);
}

function terraformRule(ctx: RuleContext) {
	const pos = positionals(ctx.args).map((p) => p.text);
	const autoApprove = ctx.args.some((a) => /^--?auto-approve$/.test(a.text));
	const destroyFlag = ctx.args.some((a) => /^--?destroy$/.test(a.text));
	const sub = pos[0] ?? "";
	if (sub === "destroy" || (sub === "apply" && (autoApprove || destroyFlag)) || (sub === "state" && pos[1] === "rm") || (sub === "workspace" && pos[1] === "delete")) {
		ctx.out.ask("infra-destroy", `${ctx.name} ${pos.slice(0, sub === "state" || sub === "workspace" ? 2 : 1).join(" ")}${autoApprove ? " -auto-approve" : ""}`);
	}
}

const DESTRUCTIVE_SQL = /\b(drop\s+(database|table|schema|collection)|truncate\s+(table\s+)?\w|delete\s+from\s+\w+\s*;?\s*$|dropDatabase\s*\()/im;

function sqlRule(ctx: RuleContext) {
	const texts = [...ctx.args.map((a) => a.text), ...ctx.cmd.heredocs.map((h) => h.body)];
	if (texts.some((t) => DESTRUCTIVE_SQL.test(t))) ctx.out.ask("database-drop", `destructive SQL through ${ctx.name}`);
}

function publishRule(ctx: RuleContext, subcommands: string[]) {
	const pos = positionals(ctx.args).map((p) => p.text);
	if (!pos.length || !subcommands.includes(pos[0]!)) return;
	if (ctx.name === "yarn" && pos[0] === "npm" && pos[1] !== "publish") return;
	if (ctx.args.some((a) => a.text === "--dry-run" || (a.text === "-n" && ctx.name === "cargo"))) return;
	ctx.out.ask("publish", `${ctx.name} ${pos[0]} (publishes to a public registry)`);
}

/** One-line description of a verdict for prompts and messages. */
export function describeFindings(findings: Finding[]): string {
	return findings.map((f) => f.reason).join("; ");
}
