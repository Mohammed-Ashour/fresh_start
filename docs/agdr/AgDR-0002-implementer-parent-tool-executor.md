---
id: AgDR-0002
timestamp: 2026-10-12T00:00:00Z
agent: pi
trigger: user-prompt
status: executed
---

# Implementer uses the parent's checked tool executor

> In the context of background implementation, facing missing tools and bypassed permissions, I decided to proxy tool calls through the live parent's tool executor to share capabilities and restrictions, accepting a main-session bootstrap turn.

## Context
- Slash-command contexts cannot execute tools through Pi's permission hooks.
- Tool contexts expose executeTool, which validates calls and dispatches parent tool_call and tool_result hooks, including nested codemode/MCP calls.
- Recreating extensions would duplicate state instead of sharing live permission mode and approvals.

## Options Considered
| Option | Pros | Cons |
|--------|------|------|
| Load parent's extensions in a separate child | Independent session lifecycle | Permission state and tools can differ; duplicate connections |
| Proxy through the parent's tool context | Uses live tools, hooks and permission state | Requires a bootstrap model turn; model-only tools cannot be nested |

## Decision
Chosen: proxy through the parent's tool context, because it preserves the parent's actual execution boundary rather than estimating it from configuration. A one-use token authorizes the startup tool. No raw child shell, editing, or file tools are enabled.

## Consequences
- Busy parents queue the startup request until their current turn finishes. A bounded pending startup can be cancelled.
- Callable tools are declared to the child; hidden and model-only tools are excluded. Questions use the existing cancellable ask_user tool.
- Tool availability is rechecked by the parent's executor at every call. New tools can be found by the parent's codemode/tool search mechanisms.
- The child inherits the parent's effective system instructions and configured settings, with background-task instructions appended.
- Permission dialogs use the main UI and may require focus, just as main-session tool calls do.
- The startup tool cannot launch work without a live user-created token, preventing recursive startup.

## Artifacts
- pi-extensions/extensions/mini-agents/index.ts
- Supersedes the standalone implementer tool boundary in AgDR-0001.
