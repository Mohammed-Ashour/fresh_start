/**
 * Context Usage Status Bar Extension
 *
 * Shows the current context usage percentage in the footer status bar.
 * Indicates with ⚠ when context passes 50%.
 *
 * Updates after each message, turn, model change, and session start.
 */

import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";

const STATUS_ID = "ctx";

export default function (pi: ExtensionAPI) {
	function updateStatusBar(ctx: ExtensionContext) {
		const usage = ctx.getContextUsage();
		// tokens is null right after compaction, until the next model response.
		if (!usage || usage.tokens === null || usage.percent === null) {
			ctx.ui.setStatus(STATUS_ID, "ctx: N/A");
			return;
		}

		const percent = Math.round(usage.percent);
		const indicator = percent > 50 ? "⚠ " : "";
		ctx.ui.setStatus(STATUS_ID, `${indicator}ctx: ${percent}% (${fmt(usage.tokens)}/${fmt(usage.contextWindow)})`);
	}

	function fmt(n: number): string {
		if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
		if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
		return `${n}`;
	}

	pi.on("session_start", async (_event, ctx) => {
		updateStatusBar(ctx);
	});

	pi.on("message_end", async (_event, ctx) => {
		updateStatusBar(ctx);
	});

	pi.on("turn_end", async (_event, ctx) => {
		updateStatusBar(ctx);
	});

	pi.on("model_select", async (_event, ctx) => {
		updateStatusBar(ctx);
	});
}