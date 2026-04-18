/**
 * Context Usage Status Bar Extension
 *
 * Shows the current context usage percentage in the footer status bar.
 * Highlights in red when context passes 50%.
 *
 * Updates after each message, turn, model change, and session start.
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

const STATUS_ID = "ctx";

export default function (pi: ExtensionAPI) {
	async function updateStatusBar(ctx: any) {
		const usage = ctx.getContextUsage();
		if (!usage) {
			ctx.ui.setStatus(STATUS_ID, "ctx: N/A");
			return;
		}

		const used = usage.tokens ?? 0;
		const model = ctx.model;
		const max = model?.contextWindow ?? 200_000;
		const percent = Math.round((used / max) * 100);
		const formatted = `ctx: ${percent}% (${fmt(used)}/${fmt(max)})`;

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