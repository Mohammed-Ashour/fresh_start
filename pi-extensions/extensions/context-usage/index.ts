/**
 * Context Usage
 *
 * Footer: a bar colored by what fills the context window, for example
 *
 *   ctx ███████░░░░░░░░░░░░▒ 31% 62K/200K  ●system ●tools ●memory ●skills ●chat ●output
 *
 * Each color is a category (system prompt, tools, memory files, skills, chat
 * messages, tool output); the legend names the ones present. Past 60% it also
 * shows the room left before Pi's automatic compaction.
 *
 * /context: a detailed view like Claude Code's, with a 10×10 grid, per-category
 * token counts, memory files, skills, the largest tools, and message counts.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
	buildSessionContext,
	estimateTokens,
	getAgentDir,
	type ExtensionAPI,
	type ExtensionContext,
	type Theme,
} from "@earendil-works/pi-coding-agent";
import { truncateToWidth } from "@earendil-works/pi-tui";
import {
	allocateCells,
	CATEGORY_LABELS,
	computeBreakdown,
	formatTokens,
	percentOf,
	type Breakdown,
	type Category,
} from "./breakdown.ts";

const STATUS_ID = "ctx";
const FOOTER_CELLS = 20;
const DEFAULT_RESERVE_TOKENS = 16384;

type ThemeColor = Parameters<Theme["fg"]>[0];

const COLORS: Record<Category, ThemeColor> = {
	system: "muted",
	tools: "syntaxKeyword",
	mcp: "syntaxType",
	extensionTools: "syntaxFunction",
	memory: "warning",
	skills: "syntaxNumber",
	messages: "accent",
	toolResults: "syntaxString",
	free: "dim",
	buffer: "dim",
};

/** Short legend names for the footer. */
const SHORT_LABELS: Record<Category, string> = {
	system: "system",
	tools: "tools",
	mcp: "mcp",
	extensionTools: "ext",
	memory: "memory",
	skills: "skills",
	messages: "chat",
	toolResults: "output",
	free: "free",
	buffer: "buffer",
};

/** Footer glyphs: used space is solid, the compaction buffer is shaded, free space is light. */
const FOOTER_GLYPH: Partial<Record<Category, string>> = { free: "░", buffer: "▒" };
/** Grid glyphs, as in Claude Code's /context. */
const GRID_GLYPH: Partial<Record<Category, string>> = { free: "⛶", buffer: "⛝" };

/** Auto-compaction reserve from settings, or undefined when compaction is disabled. */
function readReserveTokens(cwd: string): number | undefined {
	let reserve = DEFAULT_RESERVE_TOKENS;
	let enabled = true;
	for (const path of [join(getAgentDir(), "settings.json"), join(cwd, ".pi", "settings.json")]) {
		try {
			const compaction = JSON.parse(readFileSync(path, "utf-8")).compaction;
			if (typeof compaction?.reserveTokens === "number") reserve = compaction.reserveTokens;
			if (typeof compaction?.enabled === "boolean") enabled = compaction.enabled;
		} catch {}
	}
	return enabled ? reserve : undefined;
}

function themeOf(ctx: ExtensionContext): Theme | undefined {
	try {
		return ctx.ui.theme;
	} catch {
		return undefined;
	}
}

export default function (pi: ExtensionAPI) {
	let reserveTokens: number | undefined = DEFAULT_RESERVE_TOKENS;

	function breakdown(ctx: ExtensionContext): Breakdown {
		const active = new Set(pi.getActiveTools());
		const tools = pi.getAllTools().filter((t) => active.has(t.name));
		let messages: { role: string; tokens: number }[] = [];
		try {
			const session = buildSessionContext(ctx.sessionManager.getEntries(), ctx.sessionManager.getLeafId());
			messages = session.messages.map((m) => ({ role: m.role, tokens: estimateTokens(m) }));
		} catch {}
		let systemPrompt = "";
		try {
			systemPrompt = ctx.getSystemPrompt();
		} catch {}
		return computeBreakdown({
			systemPrompt,
			tools,
			messages,
			usage: ctx.getContextUsage(),
			contextWindow: ctx.model?.contextWindow,
			reserveTokens,
			model: ctx.model ? `${ctx.model.provider}/${ctx.model.id}` : undefined,
		});
	}

	function footerText(b: Breakdown, theme: Theme | undefined): string {
		if (b.contextWindow <= 0) return "ctx: N/A";
		const paint = (c: Category, text: string) => (theme ? theme.fg(COLORS[c], text) : text);
		const bar = allocateCells(b, FOOTER_CELLS).map((c) => paint(c, FOOTER_GLYPH[c] ?? "█")).join("");
		const percent = (b.used / b.contextWindow) * 100;
		const tone: ThemeColor = percent >= 80 ? "error" : percent >= 50 ? "warning" : "text";
		let label = `${b.estimated ? "~" : ""}${Math.round(percent)}% ${formatTokens(b.used)}/${formatTokens(b.contextWindow)}`;
		if (reserveTokens !== undefined && percent >= 60) {
			const left = Math.max(0, Math.round(((b.contextWindow - reserveTokens - b.used) / b.contextWindow) * 100));
			label += left > 0 ? ` · compact in ${left}%` : " · compacting next";
		}
		// Minimal legend: a colored dot and a short name for each part present in the bar.
		const legend = b.segments
			.filter((s) => s.category !== "free" && s.category !== "buffer" && s.tokens > 0)
			.map((s) => `${paint(s.category, "●")}${theme ? theme.fg("dim", SHORT_LABELS[s.category]) : SHORT_LABELS[s.category]}`)
			.join(" ");
		return `${theme ? theme.fg("dim", "ctx") : "ctx"} ${bar} ${theme ? theme.fg(tone, label) : label}  ${legend}`;
	}

	function update(ctx: ExtensionContext) {
		try {
			ctx.ui.setStatus(STATUS_ID, footerText(breakdown(ctx), themeOf(ctx)));
		} catch {
			ctx.ui.setStatus(STATUS_ID, "ctx: N/A");
		}
	}

	/** Lines of the detailed view. */
	function detailLines(b: Breakdown, theme: Theme | undefined): string[] {
		const paint = (c: ThemeColor, text: string) => (theme ? theme.fg(c, text) : text);
		const bold = (text: string) => (theme ? theme.bold(text) : text);
		const cells = allocateCells(b, 100);
		const grid: string[] = [];
		for (let row = 0; row < 10; row++) {
			grid.push(cells.slice(row * 10, row * 10 + 10).map((c) => paint(COLORS[c], GRID_GLYPH[c] ?? "⛁")).join(" "));
		}

		const legend: string[] = [
			`${bold(b.model ?? "Context")} · ${b.estimated ? "~" : ""}${formatTokens(b.used)}/${formatTokens(b.contextWindow)} tokens (${percentOf(b.used, b.contextWindow)})`,
			"",
			...b.segments.map((s) => {
				const glyph = paint(COLORS[s.category], GRID_GLYPH[s.category] ?? "⛁");
				return `${glyph} ${CATEGORY_LABELS[s.category]}: ${paint("muted", `${formatTokens(s.tokens)} tokens (${percentOf(s.tokens, b.contextWindow)})`)}`;
			}),
		];

		const lines = [bold("Context Usage"), ""];
		for (let i = 0; i < Math.max(grid.length, legend.length); i++) {
			lines.push(`${grid[i] ?? " ".repeat(19)}   ${legend[i] ?? ""}`);
		}

		const section = (title: string, items: { name: string; tokens: number }[], limit: number, color: ThemeColor) => {
			if (!items.length) return;
			lines.push("", bold(title));
			for (const item of items.slice(0, limit)) lines.push(`└ ${item.name}: ${paint(color, `${formatTokens(item.tokens)} tokens`)}`);
			if (items.length > limit) lines.push(paint("dim", `└ … ${items.length - limit} more`));
		};
		section("Memory files", b.memoryFiles, 10, COLORS.memory);
		section(`Skills (${b.skills.length})`, b.skills, 5, COLORS.skills);
		section(`Tools (${b.tools.length})`, b.tools.map((t) => ({ name: `${t.name} ${paint("dim", `[${CATEGORY_LABELS[t.category ?? "tools"]}]`)}`, tokens: t.tokens })), 8, COLORS.tools);
		const counts = b.messageCounts;
		lines.push("", `${bold("Messages")}`, `└ ${counts.user} user · ${counts.assistant} assistant · ${counts.toolResults} tool results`);
		if (b.estimated) lines.push("", paint("dim", "~ Estimated: Pi reports the exact total after the next model response."));
		lines.push("", paint("dim", "Sizes are chars/4 estimates. Press any key to close."));
		return lines;
	}

	pi.registerCommand("context", {
		description: "Show what fills the context window",
		handler: async (_args, ctx) => {
			const b = breakdown(ctx);
			if (ctx.mode !== "tui") {
				ctx.ui.notify(detailLines(b, undefined).join("\n"), "info");
				return;
			}
			await ctx.ui.custom<void>((tui, theme, _kb, done) => {
				const lines = detailLines(b, theme);
				return {
					render: (width: number) => lines.map((line) => truncateToWidth(line, width)),
					invalidate: () => {},
					handleInput: () => {
						done();
						tui.requestRender();
					},
				};
			});
		},
	});

	pi.on("session_start", async (_event, ctx) => {
		reserveTokens = readReserveTokens(ctx.cwd);
		update(ctx);
	});
	pi.on("message_end", async (_event, ctx) => update(ctx));
	pi.on("turn_end", async (_event, ctx) => update(ctx));
	pi.on("model_select", async (_event, ctx) => update(ctx));
}
