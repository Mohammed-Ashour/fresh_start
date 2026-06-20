import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { CURSOR_MARKER, matchesKey, truncateToWidth, visibleWidth, type Focusable, type TUI } from "@earendil-works/pi-tui";

type DiffLineKind = "context" | "add" | "remove";

type ReviewMode = "browse" | "comment";

interface DiffLine {
	kind: DiffLineKind;
	content: string;
	oldLineNumber?: number;
	newLineNumber?: number;
}

interface DiffHunk {
	header: string;
	lines: DiffLine[];
}

interface FileDiff {
	oldPath: string;
	newPath: string;
	displayPath: string;
	hunks: DiffHunk[];
	additions: number;
	removals: number;
	binary: boolean;
}

interface ReviewAnchor {
	key: string;
	filePath: string;
	hunkHeader: string;
	line: DiffLine;
}

interface ReviewComment {
	anchorKey: string;
	filePath: string;
	hunkHeader: string;
	lineKind: DiffLineKind;
	oldLineNumber?: number;
	newLineNumber?: number;
	text: string;
}

type ReviewRow =
	| { kind: "file"; file: FileDiff; text: string }
	| { kind: "hunk"; file: FileDiff; hunk: DiffHunk; text: string }
	| { kind: "line"; file: FileDiff; hunk: DiffHunk; line: DiffLine; anchor: ReviewAnchor }
	| { kind: "note"; text: string }
	| { kind: "spacer" };

interface ReviewResult {
	comments: ReviewComment[];
}

const GITHUB = {
	fg: "#c9d1d9",
	muted: "#8b949e",
	border: "#30363d",
	panel: "#0d1117",
	panelAlt: "#161b22",
	accent: "#58a6ff",
	hunkBg: "#0c2d6b",
	hunkFg: "#d2e4ff",
	addBg: "#0f2d1f",
	addBgSelected: "#17412b",
	addFg: "#aff5b4",
	removeBg: "#341a1d",
	removeBgSelected: "#52252b",
	removeFg: "#ffdcd7",
	contextBg: "#0d1117",
	contextBgSelected: "#1f2937",
	contextFg: "#c9d1d9",
	warning: "#d29922",
};

function toRgb(hex: string): [number, number, number] {
	const value = hex.replace(/^#/, "");
	return [
		Number.parseInt(value.slice(0, 2), 16),
		Number.parseInt(value.slice(2, 4), 16),
		Number.parseInt(value.slice(4, 6), 16),
	];
}

function ansi(text: string, options: { fg?: string; bg?: string; bold?: boolean } = {}): string {
	const codes: string[] = [];
	if (options.bold) {
		codes.push("1");
	}
	if (options.fg) {
		const [r, g, b] = toRgb(options.fg);
		codes.push(`38;2;${r};${g};${b}`);
	}
	if (options.bg) {
		const [r, g, b] = toRgb(options.bg);
		codes.push(`48;2;${r};${g};${b}`);
	}
	if (codes.length === 0) {
		return text;
	}
	return `\x1b[${codes.join(";")}m${text}\x1b[0m`;
}

function padVisible(text: string, width: number): string {
	const currentWidth = visibleWidth(text);
	if (currentWidth >= width) {
		return truncateToWidth(text, width);
	}
	return text + " ".repeat(width - currentWidth);
}

function splitArgs(input: string): string[] {
	const tokens: string[] = [];
	let current = "";
	let quote: '"' | "'" | undefined;
	let escaped = false;

	for (const char of input) {
		if (escaped) {
			current += char;
			escaped = false;
			continue;
		}
		if (char === "\\") {
			escaped = true;
			continue;
		}
		if (quote) {
			if (char === quote) {
				quote = undefined;
			} else {
				current += char;
			}
			continue;
		}
		if (char === '"' || char === "'") {
			quote = char;
			continue;
		}
		if (/\s/.test(char)) {
			if (current.length > 0) {
				tokens.push(current);
				current = "";
			}
			continue;
		}
		current += char;
	}

	if (current.length > 0) {
		tokens.push(current);
	}
	return tokens;
}

function parseDiff(diffText: string): FileDiff[] {
	const files: FileDiff[] = [];
	const lines = diffText.split(/\r?\n/);
	let currentFile: FileDiff | undefined;
	let currentHunk: DiffHunk | undefined;
	let oldLine = 0;
	let newLine = 0;

	for (const line of lines) {
		if (line.startsWith("diff --git ")) {
			if (currentFile) {
				files.push(currentFile);
			}
			const match = line.match(/^diff --git a\/(.+) b\/(.+)$/);
			const oldPath = match?.[1] ?? "unknown";
			const newPath = match?.[2] ?? oldPath;
			currentFile = {
				oldPath,
				newPath,
				displayPath: newPath,
				hunks: [],
				additions: 0,
				removals: 0,
				binary: false,
			};
			currentHunk = undefined;
			continue;
		}
		if (!currentFile) {
			continue;
		}
		if (!currentHunk && (line.startsWith("Binary files ") || line.startsWith("GIT binary patch"))) {
			currentFile.binary = true;
			continue;
		}
		if (!currentHunk && line.startsWith("--- ")) {
			const oldPath = line.slice(4).trim();
			if (oldPath !== "/dev/null") {
				currentFile.oldPath = oldPath.replace(/^a\//, "");
			}
			continue;
		}
		if (!currentHunk && line.startsWith("+++ ")) {
			const newPath = line.slice(4).trim();
			if (newPath !== "/dev/null") {
				currentFile.newPath = newPath.replace(/^b\//, "");
				currentFile.displayPath = currentFile.newPath;
			}
			continue;
		}
		if (line.startsWith("@@")) {
			const hunkMatch = line.match(/^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@(.*)$/);
			oldLine = Number.parseInt(hunkMatch?.[1] ?? "0", 10);
			newLine = Number.parseInt(hunkMatch?.[3] ?? "0", 10);
			currentHunk = {
				header: line,
				lines: [],
			};
			currentFile.hunks.push(currentHunk);
			continue;
		}
		if (!currentHunk) {
			continue;
		}
		if (line.startsWith("+")) {
			currentHunk.lines.push({ kind: "add", content: line.slice(1), newLineNumber: newLine });
			currentFile.additions += 1;
			newLine += 1;
			continue;
		}
		if (line.startsWith("-")) {
			currentHunk.lines.push({ kind: "remove", content: line.slice(1), oldLineNumber: oldLine });
			currentFile.removals += 1;
			oldLine += 1;
			continue;
		}
		if (line.startsWith(" ")) {
			currentHunk.lines.push({
				kind: "context",
				content: line.slice(1),
				oldLineNumber: oldLine,
				newLineNumber: newLine,
			});
			oldLine += 1;
			newLine += 1;
			continue;
		}
		if (line.startsWith("\\ No newline at end of file")) {
			currentHunk.lines.push({ kind: "context", content: line, oldLineNumber: oldLine, newLineNumber: newLine });
		}
	}

	if (currentFile) {
		files.push(currentFile);
	}

	return files.filter((file) => file.hunks.length > 0 || file.binary);
}

function buildRows(files: FileDiff[]): ReviewRow[] {
	const rows: ReviewRow[] = [];
	for (const file of files) {
		rows.push({
			kind: "file",
			file,
			text: `${file.displayPath}  +${file.additions}  -${file.removals}`,
		});
		if (file.binary || file.hunks.length === 0) {
			rows.push({ kind: "note", text: "Binary or metadata-only diff. Inline comments are unavailable for this file." });
			rows.push({ kind: "spacer" });
			continue;
		}
		for (const hunk of file.hunks) {
			rows.push({ kind: "hunk", file, hunk, text: hunk.header });
			for (const line of hunk.lines) {
				rows.push({
					kind: "line",
					file,
					hunk,
					line,
					anchor: {
						key: `${file.displayPath}:${hunk.header}:${line.oldLineNumber ?? "_"}:${line.newLineNumber ?? "_"}:${line.content}`,
						filePath: file.displayPath,
						hunkHeader: hunk.header,
						line,
					},
				});
			}
		}
		rows.push({ kind: "spacer" });
	}
	return rows;
}

function buildReviewDraft(comments: ReviewComment[]): string {
	const lines: string[] = ["Comments"];

	if (comments.length === 0) {
		lines.push("- No inline comments were captured.");
	} else {
		for (const [index, comment] of comments.entries()) {
			const refs: string[] = [`file=${comment.filePath}`];
			if (comment.oldLineNumber !== undefined) {
				refs.push(`old=${comment.oldLineNumber}`);
			}
			if (comment.newLineNumber !== undefined) {
				refs.push(`new=${comment.newLineNumber}`);
			}
			refs.push(`kind=${comment.lineKind}`);
			lines.push(`${index + 1}. ${refs.join(", ")}`);
			lines.push(`   block: ${comment.hunkHeader}`);
			lines.push(`   comment: ${comment.text}`);
			lines.push("");
		}
	}

	lines.push("Please address or discuss each comment using the refs above.");
	return lines.join("\n");
}

class DiffReviewComponent implements Focusable {
	focused = false;

	private readonly selectableRowIndices: number[];
	private readonly maxLineNumberWidth: number;
	private readonly commentsByAnchor = new Map<string, ReviewComment>();
	private selectedSelectableIndex = 0;
	private scrollTop = 0;
	private mode: ReviewMode = "browse";
	private commentDraft = "";
	private commentCursor = 0;

	constructor(
		private readonly tui: TUI,
		private readonly done: (result: ReviewResult | null) => void,
		private readonly rows: ReviewRow[],
	) {
		this.selectableRowIndices = rows.flatMap((row, index) => (row.kind === "line" ? [index] : []));
		this.maxLineNumberWidth = Math.max(
			3,
			...rows.flatMap((row) => {
				if (row.kind !== "line") {
					return [];
				}
				return [row.line.oldLineNumber ?? 0, row.line.newLineNumber ?? 0];
			}),
		)
			.toString()
			.length;
	}

	private currentRow(): ReviewRow | undefined {
		const rowIndex = this.selectableRowIndices[this.selectedSelectableIndex];
		return rowIndex === undefined ? undefined : this.rows[rowIndex];
	}

	private currentLineRow(): Extract<ReviewRow, { kind: "line" }> | undefined {
		const row = this.currentRow();
		return row?.kind === "line" ? row : undefined;
	}

	private currentComment(): ReviewComment | undefined {
		const row = this.currentLineRow();
		return row ? this.commentsByAnchor.get(row.anchor.key) : undefined;
	}

	private requestRender(): void {
		this.tui.requestRender();
	}

	private viewportHeight(): number {
		return Math.max(10, this.tui.terminal.rows - (this.mode === "comment" ? 8 : 7));
	}

	private ensureVisible(): void {
		const rowIndex = this.selectableRowIndices[this.selectedSelectableIndex];
		if (rowIndex === undefined) {
			return;
		}
		const height = this.viewportHeight();
		if (rowIndex < this.scrollTop) {
			this.scrollTop = rowIndex;
		}
		if (rowIndex >= this.scrollTop + height) {
			this.scrollTop = rowIndex - height + 1;
		}
	}

	private moveSelection(delta: number): void {
		if (this.selectableRowIndices.length === 0) {
			return;
		}
		this.selectedSelectableIndex = Math.max(
			0,
			Math.min(this.selectableRowIndices.length - 1, this.selectedSelectableIndex + delta),
		);
		this.ensureVisible();
		this.requestRender();
	}

	private jumpToBoundary(boundaryKind: "file" | "hunk", direction: 1 | -1): void {
		if (this.selectableRowIndices.length === 0) {
			return;
		}
		const currentRowIndex = this.selectableRowIndices[this.selectedSelectableIndex] ?? 0;
		for (let scanIndex = currentRowIndex + direction; scanIndex >= 0 && scanIndex < this.rows.length; scanIndex += direction) {
			const row = this.rows[scanIndex];
			if (row?.kind !== boundaryKind) {
				continue;
			}
			for (let targetIndex = scanIndex + 1; targetIndex < this.rows.length; targetIndex += 1) {
				const targetRow = this.rows[targetIndex];
				if (targetRow?.kind === "line") {
					const selectableIndex = this.selectableRowIndices.indexOf(targetIndex);
					if (selectableIndex >= 0) {
						this.selectedSelectableIndex = selectableIndex;
						this.ensureVisible();
						this.requestRender();
						return;
					}
				}
				if (boundaryKind === "hunk" && targetRow?.kind === "file") {
					break;
				}
				if (boundaryKind === "file" && targetRow?.kind === "file") {
					break;
				}
			}
		}
	}

	private beginComment(): void {
		const current = this.currentComment();
		this.mode = "comment";
		this.commentDraft = current?.text ?? "";
		this.commentCursor = this.commentDraft.length;
		this.requestRender();
	}

	private saveComment(): void {
		const row = this.currentLineRow();
		if (!row) {
			this.mode = "browse";
			return;
		}
		const text = this.commentDraft.trim();
		if (text.length === 0) {
			this.commentsByAnchor.delete(row.anchor.key);
		} else {
			this.commentsByAnchor.set(row.anchor.key, {
				anchorKey: row.anchor.key,
				filePath: row.anchor.filePath,
				hunkHeader: row.anchor.hunkHeader,
				lineKind: row.line.kind,
				oldLineNumber: row.line.oldLineNumber,
				newLineNumber: row.line.newLineNumber,
				text,
			});
		}
		this.mode = "browse";
		this.requestRender();
	}

	private deleteComment(): void {
		const row = this.currentLineRow();
		if (!row) {
			return;
		}
		this.commentsByAnchor.delete(row.anchor.key);
		this.requestRender();
	}

	private completeReview(): void {
		const comments = Array.from(this.commentsByAnchor.values()).sort((left, right) => {
			if (left.filePath !== right.filePath) {
				return left.filePath.localeCompare(right.filePath);
			}
			return (left.newLineNumber ?? left.oldLineNumber ?? 0) - (right.newLineNumber ?? right.oldLineNumber ?? 0);
		});
		this.done({ comments });
	}

	private commentInput(): string {
		const before = this.commentDraft.slice(0, this.commentCursor);
		const cursorChar = this.commentCursor < this.commentDraft.length ? this.commentDraft[this.commentCursor] : " ";
		const after = this.commentDraft.slice(this.commentCursor + 1);
		const marker = this.focused ? CURSOR_MARKER : "";
		return `${before}${marker}\x1b[7m${cursorChar}\x1b[27m${after}`;
	}

	handleInput(data: string): void {
		if (this.mode === "comment") {
			this.handleCommentInput(data);
			return;
		}

		if (matchesKey(data, "escape") || data === "q") {
			this.done(null);
			return;
		}
		if (matchesKey(data, "up")) {
			this.moveSelection(-1);
			return;
		}
		if (matchesKey(data, "down")) {
			this.moveSelection(1);
			return;
		}
		if (matchesKey(data, "pageUp")) {
			this.moveSelection(-Math.max(1, this.viewportHeight() - 2));
			return;
		}
		if (matchesKey(data, "pageDown")) {
			this.moveSelection(Math.max(1, this.viewportHeight() - 2));
			return;
		}
		if (matchesKey(data, "home")) {
			this.selectedSelectableIndex = 0;
			this.ensureVisible();
			this.requestRender();
			return;
		}
		if (matchesKey(data, "end")) {
			this.selectedSelectableIndex = Math.max(0, this.selectableRowIndices.length - 1);
			this.ensureVisible();
			this.requestRender();
			return;
		}
		if (data === "n") {
			this.jumpToBoundary("hunk", 1);
			return;
		}
		if (data === "p") {
			this.jumpToBoundary("hunk", -1);
			return;
		}
		if (data === "f") {
			this.jumpToBoundary("file", 1);
			return;
		}
		if (data === "b") {
			this.jumpToBoundary("file", -1);
			return;
		}
		if (data === "c" || matchesKey(data, "enter")) {
			this.beginComment();
			return;
		}
		if (data === "d") {
			this.deleteComment();
			return;
		}
		if (data === "e") {
			this.completeReview();
		}
	}

	private handleCommentInput(data: string): void {
		if (matchesKey(data, "escape")) {
			this.mode = "browse";
			this.requestRender();
			return;
		}
		if (matchesKey(data, "enter")) {
			this.saveComment();
			return;
		}
		if (matchesKey(data, "left")) {
			this.commentCursor = Math.max(0, this.commentCursor - 1);
			this.requestRender();
			return;
		}
		if (matchesKey(data, "right")) {
			this.commentCursor = Math.min(this.commentDraft.length, this.commentCursor + 1);
			this.requestRender();
			return;
		}
		if (matchesKey(data, "home")) {
			this.commentCursor = 0;
			this.requestRender();
			return;
		}
		if (matchesKey(data, "end")) {
			this.commentCursor = this.commentDraft.length;
			this.requestRender();
			return;
		}
		if (matchesKey(data, "backspace")) {
			if (this.commentCursor > 0) {
				this.commentDraft =
					this.commentDraft.slice(0, this.commentCursor - 1) + this.commentDraft.slice(this.commentCursor);
				this.commentCursor -= 1;
				this.requestRender();
			}
			return;
		}
		if (matchesKey(data, "delete")) {
			if (this.commentCursor < this.commentDraft.length) {
				this.commentDraft =
					this.commentDraft.slice(0, this.commentCursor) + this.commentDraft.slice(this.commentCursor + 1);
				this.requestRender();
			}
			return;
		}
		if (matchesKey(data, "ctrl+u")) {
			this.commentDraft = "";
			this.commentCursor = 0;
			this.requestRender();
			return;
		}
		if (data.length === 1 && data.charCodeAt(0) >= 32) {
			this.commentDraft =
				this.commentDraft.slice(0, this.commentCursor) + data + this.commentDraft.slice(this.commentCursor);
			this.commentCursor += 1;
			this.requestRender();
		}
	}

	private renderHeader(width: number): string[] {
		const title = ansi(padVisible(" GitHub-style Diff Review ", width), {
			fg: GITHUB.fg,
			bg: GITHUB.panelAlt,
			bold: true,
		});
		const status = padVisible(
			` ${this.commentsByAnchor.size} comment(s) • n/p next/prev block • f/b next/prev file • c comment • e end review `,
			width,
		);
		const subtitle = ansi(status, { fg: GITHUB.muted, bg: GITHUB.panelAlt });
		return [title, subtitle, ansi("─".repeat(width), { fg: GITHUB.border })];
	}

	private renderFileRow(width: number, row: Extract<ReviewRow, { kind: "file" }>): string {
		const commentCount = Array.from(this.commentsByAnchor.values()).filter((comment) => comment.filePath === row.file.displayPath)
			.length;
		const text = padVisible(
			` ${row.file.displayPath}  +${row.file.additions}  -${row.file.removals}  ${commentCount > 0 ? `💬${commentCount}` : ""}`.trimEnd(),
			width,
		);
		return ansi(text, { fg: GITHUB.fg, bg: GITHUB.panelAlt, bold: true });
	}

	private renderHunkRow(width: number, row: Extract<ReviewRow, { kind: "hunk" }>): string {
		return ansi(padVisible(` ${row.text}`, width), { fg: GITHUB.hunkFg, bg: GITHUB.hunkBg });
	}

	private renderLineRow(width: number, row: Extract<ReviewRow, { kind: "line" }>, selected: boolean): string {
		const oldLine = row.line.oldLineNumber === undefined ? "" : row.line.oldLineNumber.toString();
		const newLine = row.line.newLineNumber === undefined ? "" : row.line.newLineNumber.toString();
		const sign = row.line.kind === "add" ? "+" : row.line.kind === "remove" ? "-" : " ";
		const badge = this.commentsByAnchor.has(row.anchor.key) ? "  💬" : "";
		const text = `${selected ? "▶" : " "} ${oldLine.padStart(this.maxLineNumberWidth)} ${newLine.padStart(this.maxLineNumberWidth)} ${sign} ${row.line.content}${badge}`;
		const padded = padVisible(truncateToWidth(text, width), width);
		if (row.line.kind === "add") {
			return ansi(padded, { fg: GITHUB.addFg, bg: selected ? GITHUB.addBgSelected : GITHUB.addBg });
		}
		if (row.line.kind === "remove") {
			return ansi(padded, { fg: GITHUB.removeFg, bg: selected ? GITHUB.removeBgSelected : GITHUB.removeBg });
		}
		return ansi(padded, { fg: GITHUB.contextFg, bg: selected ? GITHUB.contextBgSelected : GITHUB.contextBg });
	}

	private renderNoteRow(width: number, row: Extract<ReviewRow, { kind: "note" }>): string {
		return ansi(padVisible(` ${row.text}`, width), { fg: GITHUB.warning, bg: GITHUB.panel });
	}

	private renderSpacer(width: number): string {
		return ansi(" ".repeat(width), { bg: GITHUB.panel });
	}

	private renderDiffPane(width: number, height: number): string[] {
		const visibleRows = this.rows.slice(this.scrollTop, this.scrollTop + height);
		const selectedRowIndex = this.selectableRowIndices[this.selectedSelectableIndex];
		const output = visibleRows.map((row, offset) => {
			const absoluteIndex = this.scrollTop + offset;
			if (row.kind === "file") {
				return this.renderFileRow(width, row);
			}
			if (row.kind === "hunk") {
				return this.renderHunkRow(width, row);
			}
			if (row.kind === "line") {
				return this.renderLineRow(width, row, absoluteIndex === selectedRowIndex);
			}
			if (row.kind === "note") {
				return this.renderNoteRow(width, row);
			}
			return this.renderSpacer(width);
		});
		while (output.length < height) {
			output.push(this.renderSpacer(width));
		}
		return output;
	}

	private renderCommentsPane(width: number, height: number): string[] {
		const output: string[] = [];
		output.push(ansi(padVisible(" Comments ", width), { fg: GITHUB.fg, bg: GITHUB.panelAlt, bold: true }));
		const currentAnchor = this.currentLineRow()?.anchor.key;
		const comments = Array.from(this.commentsByAnchor.values());
		if (comments.length === 0) {
			output.push(ansi(padVisible(" No comments yet. Press c on a diff line.", width), { fg: GITHUB.muted, bg: GITHUB.panel }));
		} else {
			for (const [index, comment] of comments.entries()) {
				if (output.length >= height) {
					break;
				}
				const isCurrent = comment.anchorKey === currentAnchor;
				const ref = `${comment.filePath}:${comment.newLineNumber ?? comment.oldLineNumber ?? "?"}`;
				output.push(
					ansi(padVisible(` ${index + 1}. ${ref}`, width), {
						fg: isCurrent ? GITHUB.accent : GITHUB.fg,
						bg: GITHUB.panel,
						bold: isCurrent,
					}),
				);
				if (output.length >= height) {
					break;
				}
				output.push(ansi(padVisible(`    ${comment.text}`, width), { fg: GITHUB.muted, bg: GITHUB.panel }));
			}
		}
		while (output.length < height) {
			output.push(ansi(" ".repeat(width), { bg: GITHUB.panel }));
		}
		return output.slice(0, height);
	}

	private renderFooter(width: number): string[] {
		const current = this.currentLineRow();
		const ref = current
			? `${current.file.displayPath} • old ${current.line.oldLineNumber ?? "-"} • new ${current.line.newLineNumber ?? "-"}`
			: "No selectable lines";
		const lines = [
			ansi("─".repeat(width), { fg: GITHUB.border }),
			ansi(padVisible(` ${ref}`, width), { fg: GITHUB.muted, bg: GITHUB.panelAlt }),
		];
		if (this.mode === "comment") {
			lines.push(ansi(padVisible(" Comment mode • Enter save • Esc cancel • Ctrl+U clear ", width), { fg: GITHUB.fg, bg: GITHUB.panelAlt }));
			lines.push(ansi(padVisible(` ${this.commentInput()}`, width), { fg: GITHUB.fg, bg: GITHUB.panel }));
		} else {
			lines.push(ansi(padVisible(" ↑↓ move • PgUp/PgDn scroll • n/p block • f/b file • c add/edit • d delete • e end review ", width), { fg: GITHUB.fg, bg: GITHUB.panelAlt }));
		}
		return lines;
	}

	render(width: number): string[] {
		const safeWidth = Math.max(40, width);
		const header = this.renderHeader(safeWidth);
		const footer = this.renderFooter(safeWidth);
		const bodyHeight = Math.max(8, this.tui.terminal.rows - header.length - footer.length);
		const diffWidth = Math.max(24, Math.floor(safeWidth * 0.68));
		const commentWidth = Math.max(14, safeWidth - diffWidth - 1);
		const diffPane = this.renderDiffPane(diffWidth, bodyHeight);
		const commentsPane = this.renderCommentsPane(commentWidth, bodyHeight);
		const body = diffPane.map((left, index) => `${padVisible(left, diffWidth)}${ansi("│", { fg: GITHUB.border })}${padVisible(commentsPane[index] ?? "", commentWidth)}`);
		return [...header, ...body, ...footer].map((line) => truncateToWidth(line, safeWidth));
	}

	invalidate(): void {}
}

export default function diffReviewExtension(pi: ExtensionAPI) {
	async function execGit(args: string[]): Promise<{ stdout: string; stderr: string; code: number }> {
		const result = await pi.exec("git", args, { timeout: 30_000 });
		return {
			stdout: result.stdout,
			stderr: result.stderr,
			code: result.code,
		};
	}

	pi.registerCommand("diff-review", {
		description: "Open a GitHub-style diff review window and feed comments back into the editor",
		handler: async (args, ctx) => {
			if (ctx.mode !== "tui") {
				ctx.ui.notify("/diff-review requires TUI mode", "error");
				return;
			}

			const userArgs = args?.trim() ?? "";
			const diffArgs = splitArgs(userArgs);

			const insideRepo = await execGit(["rev-parse", "--is-inside-work-tree"]);
			if (insideRepo.code !== 0 || insideRepo.stdout.trim() !== "true") {
				ctx.ui.notify("/diff-review must run inside a git repository", "error");
				return;
			}

			const diffResult = await execGit(["diff", "--no-ext-diff", "--find-renames", "--unified=3", "--relative", ...diffArgs]);
			if (diffResult.code !== 0) {
				ctx.ui.notify(diffResult.stderr.trim() || "git diff failed", "error");
				return;
			}
			if (!diffResult.stdout.trim()) {
				ctx.ui.notify("No diff found for review", "info");
				return;
			}

			const files = parseDiff(diffResult.stdout);
			if (files.length === 0) {
				ctx.ui.notify("No text hunks found to review", "warning");
				return;
			}

			const rows = buildRows(files);
			const review = await ctx.ui.custom<ReviewResult | null>((tui, _theme, _keybindings, done) => {
				return new DiffReviewComponent(tui, done, rows);
			});

			if (!review) {
				ctx.ui.notify("Diff review cancelled", "info");
				return;
			}

			ctx.ui.setEditorText(buildReviewDraft(review.comments));
			ctx.ui.notify("Review notes loaded into the editor. Press Enter to send them back to this session.", "info");
		},
	});

	pi.registerCommand("diff-review-theme", {
		description: "Switch to the bundled GitHub-like diff review theme",
		handler: async (_args, ctx) => {
			const result = ctx.ui.setTheme("github-diff");
			if (!result.success) {
				ctx.ui.notify(`Could not load github-diff theme: ${result.error}`, "error");
				return;
			}
			ctx.ui.notify("Switched to github-diff", "info");
		},
	});
}
