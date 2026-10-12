---
id: AgDR-0001
timestamp: 2026-10-12T00:00:00Z
agent: pi
trigger: user-prompt
status: executed
---

# Non-blocking peek and background implementation

> In the context of background Pi jobs, facing peek stealing session input, I decided to use an editor widget and a reply command to keep the main session usable, accepting a compact log and shared-checkout edits.

## Context
- mini-agents already owns child sessions, progress, cancellation and reports.
- Users need to keep typing while observing jobs and choose when to answer questions.

## Options Considered
| Option | Pros | Cons |
|--------|------|------|
| Unfocused overlay with focus switching | Larger scrollable view | Additional focus and overlay lifecycle controls |
| Editor widget and explicit reply command | Never captures input; uses existing UI mechanism | Compact tail instead of full interactive log |
| Implementer in a worktree | Isolated edits | Requires branch creation and result integration |
| Implementer in current checkout | Changes immediately available | Main session edits can conflict |

## Decision
Chosen: editor widget, explicit reply command, and one implementer in the current checkout, because these reuse the existing workflow without introducing focus management or automatic Git integration.

## Consequences
- Peek stays visible until closed, including after completion.
- Questions notify without opening unsolicited dialogs. Replies resume the waiting tool.
- Cancellation rejects pending questions. Only one implementer may run, but parent edits remain possible and require user coordination.
- The original standalone implementer tool boundary was replaced by the parent's checked executor in AgDR-0002. Starting still requires explicit confirmation.

## Artifacts
- pi-extensions/extensions/mini-agents/index.ts
