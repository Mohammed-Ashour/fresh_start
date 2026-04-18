/**
 * Context Usage Status Bar Extension
 *
 * Shows the current context usage percentage in the footer status bar.
 * Indicates with ⚠ when context passes 50%.
 *
 * Updates after each message, turn, model change, and session start.
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

const STATUS_ID = "ctx";

export default function (pi: ExtensionAPI) {
	async function updateStatusBar(ctx: { getContextUsage: () => any; model: any; ui: { setStatus: (id: string, text: string | undefined) => void } }) {
		const usage = ctx.getContextUsage();
		if (!usage || usage.tokens === undefined) {
			ctx.ui.setStatus(STATUS_ID, "ctx: N/A");
			return;
		}

		const used = usage.tokens;
		const max = ctx.model?.contextWindow ?? 200_000;
		const percent = Math.round((used / max) * 100);
		const indicator = percent > 50 ? "⚠" : "";
		const formatted = `${indicator} ctx: ${percent}% (${fmt(used)}/${fmt(max)})`;

		ctx.ui.setStatus(STATUS_ID, formatted);
	}

	function fmt(n: number): string {
		if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
		if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
		return `${n}`;
	}

	pi.on("session_start", async (_event, ctx) => {
		await updateStatusBar(ctx);
	});

	pi.on("message_end", async (_event, ctx) => {
		await updateStatusBar(ctx);
	});

	pi.on("turn_end", async (_event, ctx) => {
		await updateStatusBar(ctx);
	});

	pi.on("model_select", async (_event, ctx) => {
		await updateStatusBar(ctx);
	});
}