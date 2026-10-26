---
id: AgDR-0004
timestamp: 2026-10-26T07:47:41Z
agent: pi
model: unknown
trigger: user-prompt
status: executed
---

# Generic mini-agents

> In the context of three command-specific background workflows, facing a need for direct model delegation and shared user controls, I decided to use one named agent record and one management tool to give both creators the same lifecycle, accepting a command migration.

## Context
- Existing workflows already share job execution and widgets.
- Writable children must retain the parent's live checked executor and launch directory.
- Users need to inspect, message, and stop model-created agents too.

## Options Considered
| Option | Pros | Cons |
|--------|------|------|
| Add model tools to each existing workflow | Preserves commands | Keeps role-specific settings and duplicated management paths |
| One generic agent with capability options | Shared IDs, UI, messaging and execution | Replaces the old commands and settings |

## Decision
Chosen: **One generic agent**, because names and purposes express roles without separate implementations. Use read-only execution by default, optional web and pinned PR access, and opt-in parent-proxied tools. A model-only management tool prevents child delegation. Manual writable startup uses a one-use token through that same tool. Keep completed agent sessions available for follow-up messages until stop or session shutdown, and retain their status and reports for the current parent session.

## Consequences
- `/mini-agents` replaces `/reviewers`, `/researchers`, and `/implementer`.
- Completed child sessions consume memory until stopped or the parent closes.
- Reports remain on disk; live agent handles are session-local, not restored after reload.
- Shared checkout editing still needs coordination. Tool restrictions are not an OS sandbox.

## Artifacts
- `pi-extensions/extensions/mini-agents/index.ts`
- `pi-extensions/extensions/mini-agents/tests/mini-agents.test.mjs`
