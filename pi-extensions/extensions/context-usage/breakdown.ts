/**
 * Context breakdown: where the tokens in the context window go.
 *
 * Pure functions with no Pi runtime imports, so tests can load them directly.
 * Category sizes are chars/4 estimates (the same heuristic Pi uses). When Pi
 * knows the real total from the last model response, the conversation share is
 * the real total minus the fixed parts, so the bar adds up to the real number.
 */

export type Category =
	| "system"
	| "tools"
	| "mcp"
	| "extensionTools"
	| "memory"
	| "skills"
	| "messages"
	| "toolResults"
	| "free"
	| "buffer";

export const CATEGORY_LABELS: Record<Category, string> = {
	system: "System prompt",
	tools: "Built-in tools",
	mcp: "MCP tools",
	extensionTools: "Extension tools",
	memory: "Memory files",
	skills: "Skills",
	messages: "Messages",
	toolResults: "Tool results",
	free: "Free space",
	buffer: "Auto-compact buffer",
};

export interface Segment {
	category: Category;
	tokens: number;
}

export interface Item {
	name: string;
	tokens: number;
	category?: Category;
}

export interface Breakdown {
	model?: string;
	contextWindow: number;
	used: number;
	/** True when Pi has no real total yet (for example right after compaction). */
	estimated: boolean;
	segments: Segment[];
	memoryFiles: Item[];
	skills: Item[];
	tools: Item[];
	messageCounts: { user: number; assistant: number; toolResults: number };
}

export interface ToolLike {
	name: string;
	description?: string;
	parameters?: unknown;
	promptGuidelines?: readonly string[];
	namespace?: unknown;
	sourceInfo?: { path?: string; source?: string };
}

export interface MessageLike {
	role: string;
	tokens: number;
}

export interface UsageLike {
	tokens: number | null;
	contextWindow: number;
	percent: number | null;
}

export function estimateTextTokens(text: string): number {
	return Math.ceil(text.length / 4);
}

export function formatTokens(n: number): string {
	if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
	if (n >= 10_000) return `${Math.round(n / 1_000)}K`;
	if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
	return `${Math.round(n)}`;
}

function unescapeXml(text: string): string {
	return text.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");
}

/** Split Pi's system prompt into its base, memory files (AGENTS.md etc.), and skills list. */
export function splitSystemPrompt(prompt: string) {
	const memoryBlock = /<project_context>[\s\S]*?<\/project_context>/.exec(prompt)?.[0] ?? "";
	const skillsBlock = /<skills>[\s\S]*?<\/skills>/.exec(prompt)?.[0] ?? "";
	const memoryFiles: Item[] = [];
	for (const m of memoryBlock.matchAll(/<project_instructions path="([^"]*)">[\s\S]*?<\/project_instructions>/g)) {
		memoryFiles.push({ name: m[1]!, tokens: estimateTextTokens(m[0]) });
	}
	const skills: Item[] = [];
	for (const m of skillsBlock.matchAll(/<skill>\s*<name>([\s\S]*?)<\/name>[\s\S]*?<\/skill>/g)) {
		skills.push({ name: unescapeXml(m[1]!), tokens: estimateTextTokens(m[0]) });
	}
	const memory = estimateTextTokens(memoryBlock);
	const skillTokens = estimateTextTokens(skillsBlock);
	return {
		system: Math.max(0, estimateTextTokens(prompt) - memory - skillTokens),
		memory,
		skills: skillTokens,
		memoryFiles,
		skillsList: skills,
	};
}

export function toolCategory(tool: ToolLike): Category {
	const path = tool.sourceInfo?.path ?? "";
	const source = tool.sourceInfo?.source ?? "";
	if (tool.namespace || /mcp/i.test(path) || /mcp/i.test(source) || tool.name.startsWith("mcp__")) return "mcp";
	if (path.startsWith("builtin:") || source === "builtin") return "tools";
	return "extensionTools";
}

export function toolTokens(tool: ToolLike): number {
	const text = [tool.name, tool.description ?? "", JSON.stringify(tool.parameters ?? {}), ...(tool.promptGuidelines ?? [])].join("\n");
	return estimateTextTokens(text);
}

export function computeBreakdown(input: {
	systemPrompt: string;
	tools: ToolLike[];
	messages: MessageLike[];
	usage: UsageLike | undefined;
	contextWindow?: number;
	/** Auto-compaction reserve; undefined when auto-compaction is off. */
	reserveTokens?: number;
	model?: string;
}): Breakdown {
	const prompt = splitSystemPrompt(input.systemPrompt);
	const tools: Item[] = input.tools.map((t) => ({ name: t.name, tokens: toolTokens(t), category: toolCategory(t) }));
	const toolSum = (category: Category) => tools.filter((t) => t.category === category).reduce((n, t) => n + t.tokens, 0);

	const fixed: Segment[] = [
		{ category: "system", tokens: prompt.system },
		{ category: "tools", tokens: toolSum("tools") },
		{ category: "mcp", tokens: toolSum("mcp") },
		{ category: "extensionTools", tokens: toolSum("extensionTools") },
		{ category: "memory", tokens: prompt.memory },
		{ category: "skills", tokens: prompt.skills },
	];
	const fixedTotal = fixed.reduce((n, s) => n + s.tokens, 0);

	let messageTokens = 0;
	let toolResultTokens = 0;
	const messageCounts = { user: 0, assistant: 0, toolResults: 0 };
	for (const m of input.messages) {
		if (m.role === "toolResult") {
			toolResultTokens += m.tokens;
			messageCounts.toolResults++;
		} else {
			messageTokens += m.tokens;
			if (m.role === "assistant") messageCounts.assistant++;
			else messageCounts.user++;
		}
	}

	const contextWindow = input.usage?.contextWindow || input.contextWindow || 0;
	const real = input.usage?.tokens ?? null;
	let estimated = true;
	if (real !== null) {
		// Scale the conversation estimate so the parts add up to the real total.
		const conversation = Math.max(0, real - fixedTotal);
		const estimate = messageTokens + toolResultTokens;
		const scale = estimate > 0 ? conversation / estimate : 0;
		toolResultTokens = Math.round(toolResultTokens * scale);
		messageTokens = estimate > 0 ? conversation - toolResultTokens : conversation;
		estimated = false;
	}

	const used = fixedTotal + messageTokens + toolResultTokens;
	const buffer = input.reserveTokens !== undefined ? Math.min(input.reserveTokens, Math.max(0, contextWindow - used)) : 0;
	const free = Math.max(0, contextWindow - used - buffer);
	const segments: Segment[] = [
		...fixed,
		{ category: "messages" as const, tokens: messageTokens },
		{ category: "toolResults" as const, tokens: toolResultTokens },
	].filter((s) => s.tokens > 0);
	segments.push({ category: "free", tokens: free });
	if (buffer > 0) segments.push({ category: "buffer", tokens: buffer });

	const bySize = (a: Item, b: Item) => b.tokens - a.tokens;
	return {
		model: input.model,
		contextWindow,
		used,
		estimated,
		segments,
		memoryFiles: prompt.memoryFiles.sort(bySize),
		skills: prompt.skillsList.sort(bySize),
		tools: tools.sort(bySize),
		messageCounts,
	};
}

/**
 * Split `cells` between segments in proportion to their tokens (largest remainder),
 * giving every non-empty used segment at least one cell.
 */
export function allocateCells(breakdown: Breakdown, cells: number): Category[] {
	const window = breakdown.contextWindow;
	if (window <= 0) return Array(cells).fill("free");
	const exact = breakdown.segments.map((s) => (s.tokens / window) * cells);
	const counts = exact.map(Math.floor);
	breakdown.segments.forEach((s, i) => {
		if (s.tokens > 0 && counts[i] === 0 && s.category !== "free") counts[i] = 1;
	});
	let remaining = cells - counts.reduce((a, b) => a + b, 0);
	const order = exact.map((e, i) => ({ i, frac: e - Math.floor(e) })).sort((a, b) => b.frac - a.frac);
	for (let k = 0; remaining > 0 && order.length; k = (k + 1) % order.length, remaining--) counts[order[k]!.i]!++;
	// Take overflow from free space first, then from the largest segment.
	while (remaining < 0) {
		const freeIndex = breakdown.segments.findIndex((s) => s.category === "free");
		const target = freeIndex >= 0 && counts[freeIndex]! > 0 ? freeIndex : counts.indexOf(Math.max(...counts));
		counts[target]!--;
		remaining++;
	}
	return breakdown.segments.flatMap((s, i) => Array<Category>(counts[i]!).fill(s.category));
}

export function percentOf(tokens: number, window: number): string {
	if (window <= 0) return "0%";
	const p = (tokens / window) * 100;
	return p > 0 && p < 0.1 ? "<0.1%" : `${p < 10 ? p.toFixed(1) : Math.round(p)}%`;
}
