/**
 * Ask Questions Tool - Multi-question UI with recommended answers
 *
 * The agent can ask multiple questions at once, each with options.
 * Recommended answers are visually highlighted with a ★ indicator.
 * Users can select an option or type a custom answer per question.
 * After all questions are answered, results are sent to the agent.
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Editor, type EditorTheme, Key, matchesKey, Text, truncateToWidth } from "@mariozechner/pi-tui";
import { Type } from "@sinclair/typebox";

// --- Types ---

const OptionSchema = Type.Object({
	label: Type.String({ description: "Display label for the option" }),
	description: Type.Optional(Type.String({ description: "Optional detail shown below the option" })),
});

const QuestionSchema = Type.Object({
	question: Type.String({ description: "The question to ask" }),
	options: Type.Array(OptionSchema, { minItems: 1, description: "Available answer options" }),
	recommendedIndex: Type.Optional(Type.Number({ description: "0-based index of the recommended answer (optional)" })),
});

const AskQuestionsParams = Type.Object({
	questions: Type.Array(QuestionSchema, { minItems: 1, description: "Questions to present to the user" }),
});

interface QOption {
	label: string;
	description?: string;
	isRecommended?: boolean;
}

interface QAnswer {
	question: string;
	answer: string | null;
	wasCustom: boolean;
}

// --- Extension ---

export default function askQuestions(pi: ExtensionAPI) {
	pi.registerTool({
		name: "ask_questions",
		label: "Ask Questions",
		description:
			"Ask the user one or more questions with answer options. Mark recommended answers with recommendedIndex. Users can select an option or type custom answers.",
		promptSnippet: "Ask the user one or more questions with predefined options and optional recommendations",
		parameters: AskQuestionsParams,

		async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
			if (!ctx.hasUI) {
				return {
					content: [{ type: "text", text: "Error: UI not available (non-interactive mode)" }],
					details: { answers: [] },
				};
			}

			// Collected answers
			const answers: (QAnswer | null)[] = params.questions.map(() => null);

			const result = await ctx.ui.custom<QAnswer[] | null>((tui, theme, _kb, done) => {
				// State
				let activeQuestion = 0;
				let optionCursor = 0;
				let editMode = false;
				let cachedLines: string[] | undefined;

				const editorTheme: EditorTheme = {
					borderColor: (s) => theme.fg("accent", s),
					selectList: {
						selectedPrefix: (t) => theme.fg("accent", t),
						selectedText: (t) => theme.fg("accent", t),
						description: (t) => theme.fg("muted", t),
						scrollInfo: (t) => theme.fg("dim", t),
						noMatch: (t) => theme.fg("warning", t),
					},
				};
				const editor = new Editor(tui, editorTheme);

				function buildOptions(qIdx: number): QOption[] {
					const q = params.questions[qIdx];
					return q.options.map((o, i) => ({
						...o,
						isRecommended: q.recommendedIndex !== undefined && i === q.recommendedIndex,
					}));
				}

				function refresh() {
					cachedLines = undefined;
					tui.requestRender();
				}

				function selectOption(optLabel: string, wasCustom: boolean) {
					answers[activeQuestion] = { question: params.questions[activeQuestion].question, answer: optLabel, wasCustom };
					// Move to next unanswered question
					let next = activeQuestion + 1;
					while (next < params.questions.length && answers[next] !== null) {
						next++;
					}
					if (next < params.questions.length) {
						activeQuestion = next;
						optionCursor = 0;
						editMode = false;
						editor.setText("");
						refresh();
					} else {
						// All questions answered
						done(answers.filter((a): a is QAnswer => a !== null));
					}
				}

				editor.onSubmit = (value) => {
					const trimmed = value.trim();
					if (trimmed) {
						selectOption(trimmed, true);
					} else {
						editMode = false;
						editor.setText("");
						refresh();
					}
				};

				function render(width: number): string[] {
					if (cachedLines) return cachedLines;

					const lines: string[] = [];
					const add = (s: string) => lines.push(truncateToWidth(s, width));

					add(theme.fg("accent", "─".repeat(width)));

					// Progress: ● answered, ▸ current, ○ unanswered
					const progress = params.questions
						.map((_q, i) => {
							if (answers[i] !== null) return theme.fg("success", "●");
							if (i === activeQuestion) return theme.fg("accent", "▸");
							return theme.fg("dim", "○");
						})
						.join(" ");
					add(`  ${progress}  ${theme.fg("dim", `${activeQuestion + 1}/${params.questions.length}`)}`);
					lines.push("");

					// Current question
					const q = params.questions[activeQuestion];
					const opts = buildOptions(activeQuestion);

					add(theme.bold("Q") + theme.fg("text", ` ${q.question}`));
					if (q.recommendedIndex !== undefined) {
						const rec = opts[q.recommendedIndex];
						if (rec) {
							add(theme.fg("dim", `  Agent recommends: ${theme.fg("accent", rec.label)}`));
						}
					}
					lines.push("");

					// Options
					for (let i = 0; i < opts.length; i++) {
						const opt = opts[i];
						const selected = i === optionCursor;

						if (opt.isRecommended && selected) {
							add(theme.fg("accent", "▸ ★ ") + theme.fg("accent", opt.label));
						} else if (opt.isRecommended) {
							add(`  ★ ` + theme.fg("success", opt.label));
						} else if (selected) {
							add(theme.fg("accent", "▸ ") + theme.fg("accent", opt.label));
						} else {
							add(`  ${theme.fg("text", opt.label)}`);
						}

						if (opt.description) {
							add(`     ${theme.fg("muted", opt.description)}`);
						}
					}

					// "Type something..." option
					const otherIdx = opts.length;
					const isOther = optionCursor === otherIdx;

					if (isOther && editMode) {
						add(theme.fg("accent", "▸ ✎ Type something..."));
					} else if (isOther) {
						add(theme.fg("accent", "▸ Type something..."));
					} else {
						add(`  ${theme.fg("dim", `Type something...`)}`);
					}

					// Editor for custom input
					if (editMode) {
						lines.push("");
						add(theme.fg("muted", " Your answer:"));
						for (const line of editor.render(width - 2)) {
							add(` ${line}`);
						}
					}

					lines.push("");

					// Help text
					if (editMode) {
						add(theme.fg("dim", " Enter to submit • Esc to go back"));
					} else {
						add(theme.fg("dim", " ↑↓ navigate • Enter to select • Esc to cancel"));
					}
					add(theme.fg("accent", "─".repeat(width)));

					cachedLines = lines;
					return lines;
				}

				function handleInput(data: string) {
					if (editMode) {
						if (matchesKey(data, Key.escape)) {
							editMode = false;
							editor.setText("");
							refresh();
						} else {
							editor.handleInput(data);
							refresh();
						}
						return;
					}

					const opts = buildOptions(activeQuestion);
					const maxCursor = opts.length; // +1 for "type something"

					if (matchesKey(data, Key.up)) {
						optionCursor = Math.max(0, optionCursor - 1);
						refresh();
						return;
					}
					if (matchesKey(data, Key.down)) {
						optionCursor = Math.min(maxCursor, optionCursor + 1);
						refresh();
						return;
					}

					if (matchesKey(data, Key.enter)) {
						if (optionCursor < opts.length) {
							// Selected predefined option
							selectOption(opts[optionCursor].label, false);
						} else {
							// "Type something..."
							editMode = true;
							editor.setText("");
							refresh();
						}
						return;
					}

					if (matchesKey(data, Key.escape)) {
						done(null);
					}
				}

				return { render, invalidate: () => (cachedLines = undefined), handleInput };
			});

			if (!result) {
				return {
					content: [{ type: "text", text: "User cancelled" }],
					details: { answers: answers.filter((a): a is QAnswer => a !== null) },
				};
			}

			// Build response
			const lines = result.map((a) =>
				`Q: ${a.question}\nA: ${a.answer}${a.wasCustom ? " (custom)" : ""}`
			);

			return {
				content: [{ type: "text", text: lines.join("\n\n") }],
				details: { answers: result },
			};
		},

		renderCall(args, theme, _context) {
			const questions = Array.isArray(args.questions) ? args.questions : [];
			const summary = questions.map((q: any, i: number) => {
				const rec = q.recommendedIndex !== undefined && q.options?.[q.recommendedIndex] ? ` ★${q.options[q.recommendedIndex].label}` : "";
				return `${i + 1}. ${q.question}${rec}`;
			});
			let text = theme.fg("toolTitle", theme.bold("ask_questions ")) + theme.fg("muted", `(${questions.length} question${questions.length > 1 ? "s" : ""})`);
			for (const s of summary) {
				text += `\n${theme.fg("dim", "  " + s)}`;
			}
			return new Text(text, 0, 0);
		},

		renderResult(result, _options, theme, _context) {
			const details = result.details as { answers: QAnswer[] } | undefined;
			if (!details?.answers?.length) {
				return new Text(theme.fg("warning", "Cancelled"), 0, 0);
			}

			const lines = details.answers.map((a) => {
				const icon = a.wasCustom ? "✎" : "✓";
				const color = a.wasCustom ? "warning" : "success";
				return `${theme.fg(color, icon)} ${a.answer}`;
			});
			return new Text(lines.join("\n"), 0, 0);
		},
	});
}
