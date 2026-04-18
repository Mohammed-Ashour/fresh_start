/**
 * Context Usage Status Bar Extension
 *
 * Shows the current context usage percentage in the footer status bar.
 * Turns red when context passes 50%.
 *
 * Updates after each message and turn.
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

const STATUS_ID = "context-usage";

export default function (pi: ExtensionAPI) {
	async function updateStatusBar(ctx: { getContextUsage: () => any; ui: { setStatus: (id: string, text: string | undefined) => void } }) {
		const usage = ctx.getContextUsage();
		if (!usage) {
			ctx.ui.setStatus(STATUS_ID, "⏳ context: N/A");
			return;
		}

		const used = usage.tokens ?? 0;
		const model = (ctx as any).model;
		const max = model?.contextWindow ?? 200_000;
		const percent = Math.round((used / max) * 100);

		let text: string;
		if (percent > 90) {
			text = `🔴 CONTEX ${percent}% (${formatTokens(used)}/${formatTokens(max)})`;
		} else if (percent > 75) {
			text = `🟠 contxt ${percent}% (${formatTokens(used)}/${formatTokens(max)})`;
		} else if (percent > 50) {
			text = `🟡 ctx ${percent}% (${formatTokens(used)}/${formatTokens(max)})`;
		} else {
			text = `🟢 ctx ${percent}% (${formatTokens(used)}/${formatTokens(max)})`;
		}

		ctx.ui.setStatus(STATUS_ID, text);
	}

	function formatTokens(n: number): string {
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