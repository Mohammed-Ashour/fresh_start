/**
 * Context Usage Bar
 *
 * Shows how full the context window is as a bar in the footer, for example:
 *
 *   ctx ███░░░░░░░ 31% · 62K/200K
 *   ctx ████████░░ 84% · 168K/200K · 8% until auto-compact
 *
 * The bar turns yellow at 50% and red at 80%. Once usage passes 60%, it also shows
 * how much room is left before Pi compacts automatically (`compaction.reserveTokens`).
 * Updates after each message, turn, model change, and session start.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { getAgentDir, type ExtensionAPI, type ExtensionContext } from "@earendil-works/pi-coding-agent";

const STATUS_ID = "ctx";
const BAR_WIDTH = 10;
const DEFAULT_RESERVE_TOKENS = 16384;

type Tone = "success" | "warning" | "error" | "muted";

export interface ContextBar {
	tone: Tone;
	bar: string;
	label: string;
}

export function formatTokens(n: number): string {
	if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
	if (n >= 1_000) return `${Math.round(n / 1_000)}K`;
	return `${n}`;
}

/** Build the bar text. `reserveTokens` is undefined when auto-compaction is off. */
export function renderContextBar(
	usage: { tokens: number | null; contextWindow: number; percent: number | null } | undefined,
	reserveTokens: number | undefined,
): ContextBar {
	if (!usage || usage.tokens === null || usage.percent === null || usage.contextWindow <= 0) {
		// tokens is null right after compaction, until the next model response.
		return { tone: "muted", bar: "░".repeat(BAR_WIDTH), label: "ctx: N/A" };
	}
	const percent = Math.max(0, Math.min(100, usage.percent));
	const filled = Math.min(BAR_WIDTH, Math.round((percent / 100) * BAR_WIDTH));
	const bar = "█".repeat(filled) + "░".repeat(BAR_WIDTH - filled);
	const tone: Tone = percent >= 80 ? "error" : percent >= 50 ? "warning" : "success";
	let label = `${Math.round(percent)}% · ${formatTokens(usage.tokens)}/${formatTokens(usage.contextWindow)}`;
	if (reserveTokens !== undefined && percent >= 60) {
		const threshold = usage.contextWindow - reserveTokens;
		const left = Math.max(0, Math.round(((threshold - usage.tokens) / usage.contextWindow) * 100));
		label += left > 0 ? ` · ${left}% until auto-compact` : " · auto-compact next";
	}
	return { tone, bar, label };
}

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

export default function (pi: ExtensionAPI) {
	let reserveTokens: number | undefined = DEFAULT_RESERVE_TOKENS;

	function update(ctx: ExtensionContext) {
		const { tone, bar, label } = renderContextBar(ctx.getContextUsage(), reserveTokens);
		let text = `ctx ${bar} ${label}`;
		try {
			const theme = ctx.ui.theme;
			text = `${theme.fg("dim", "ctx")} ${theme.fg(tone, bar)} ${theme.fg(tone === "muted" ? "muted" : "text", label)}`;
		} catch {
			// No themed UI (print/RPC modes): keep plain text.
		}
		ctx.ui.setStatus(STATUS_ID, label === "ctx: N/A" ? "ctx: N/A" : text);
	}

	pi.on("session_start", async (_event, ctx) => {
		reserveTokens = readReserveTokens(ctx.cwd);
		update(ctx);
	});
	pi.on("message_end", async (_event, ctx) => update(ctx));
	pi.on("turn_end", async (_event, ctx) => update(ctx));
	pi.on("model_select", async (_event, ctx) => update(ctx));
}
