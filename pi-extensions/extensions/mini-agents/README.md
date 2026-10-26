# Mini-agents

Named background agents for Pi. Your main agent can create and manage them directly with `mini_agents`. You get the same UI controls whether you or the model starts them. No added dependencies.

## Use

Install this extension, then `/reload` or restart Pi. `/mini-agents` replaces `/reviewers`, `/researchers`, and `/implementer`.

```text
/mini-agents review: skipper review the current uncommitted changes
/mini-agents --pr review: deep review https://github.com/owner/project/pull/368
/mini-agents --web sources: compare pytest fixture scopes, cite primary sources
/mini-agents --write --context parser: add the parser tests we discussed
/mini-agents list
/mini-agents peek 1
/mini-agents message 1 also check validation failures
/mini-agents reply 1 use the existing fixtures
/mini-agents stop 1
```

Give each agent a name and purpose, separated by a colon. Roles are instructions, not separate types. Start two agents yourself or ask the main model to gather sources and countercheck them independently.

Options:
- Read-only by default, with file reads, Git diffs, GitHub evidence and `ask_user`.
- `--write` adds the parent's callable tools through its live permission checks. Manual starts ask for confirmation.
- `--web` loads installed `pi-web-access` tools.
- `--pr` saves and verifies a committed PR snapshot, then adds pinned head/base file reads. Include a PR URL, PR number, or "current PR" in the purpose. Without this option, no automatic PR snapshot is fetched.
- `--context` includes the latest 60k characters of readable parent conversation, excluding tool output. Otherwise agents start with a fresh conversation. Children see the enabled skills and discover AGENTS.md normally. Writable children also inherit the parent's effective instructions and settings.

## UI and controls

Every active agent appears above the editor with its ID, name, purpose, elapsed time and activity. Progress widgets never capture keyboard input.

- `/mini-agents list` includes completed agents and pending questions.
- `/mini-agents peek [id]` shows the last eight log lines in a live panel. Without an ID, pick an agent. Completed agents can still be inspected.
- `/mini-agents peek close` closes the panel without stopping the agent.
- `/mini-agents peek log [id]` opens the full retained scrollable log. Arrows/PgUp/PgDn scroll, End follows, Esc or `q` closes.
- `/mini-agents message <id> <text>` queues a message after current work or resumes a completed agent's existing conversation. If it is waiting for an answer, the message answers that question instead.
- `/mini-agents reply <id> [answer]` answers a pending question, prompting for text if omitted. Questions notify the user and appear in the parent conversation without opening a modal.
- `/mini-agents stop [id]` cancels work and closes the child's session. Without an ID, pick an agent. `stop all` closes all agents. Cancellation does not undo edits.
- `/mini-agents model` saves one model default. Otherwise new agents use the current parent model. Old per-role settings remain in the settings file but are no longer used.
- `/mini-agents help` shows syntax. Subcommands and flags autocomplete.

Results and questions appear in the parent chat without triggering a model turn. The main model can poll `status` or `list` on its next turn. Completed agents retain their conversation until stopped or the parent closes. Failed or stopped agents cannot resume; start another one.

## Model tool

One model-only tool, `mini_agents`, supports:

```json
{"action":"start","name":"coverage","purpose":"Check parser scenario coverage","context":true}
{"action":"start","name":"builder","purpose":"Add parser tests","readOnly":false,"tools":["read","edit","write","bash"]}
{"action":"list"}
{"action":"status","id":1}
{"action":"message","id":1,"message":"Focus on invalid inputs"}
{"action":"stop","id":1}
```

Start returns an ID immediately. Optional `model` is a `provider/model-id`; `web` and `pr` correspond to command flags. `tools` limits parent-proxied tools and requires `readOnly: false`. Fixed read-only helpers, web tools when requested, and `ask_user` remain available. Status includes purpose, state, activity, question, bounded output, recent log lines and report path.

Model-created writable agents use the tool call's checked parent executor directly. Manual writable startup queues a main-session call to the same tool with a stored, one-use token. Enable `mini_agents` in the parent tool configuration. Queued startup is visible and cancellable, and expires after one minute. Children cannot call this model-only management tool or recursively delegate through the nested executor.

## Workspace and permissions

Each agent captures its launch directory, Git branch and commit. Relative paths, resource discovery and GitHub PR resolution use that directory, including after queued startup. Detached HEAD, unborn branches and unavailable Git state are explicit. A writable child rejects an executor from a different directory.

Writable agents share the current checkout with the parent. Only one writable agent can be active at a time, including queued startup and question waiting. Completed writers can resume only when no other writer is active. There is no worktree isolation, branch lock or rollback. Avoid simultaneous edits to the same files and review changes before committing.

Parent-proxied tools keep validation, permission mode, approvals and result hooks live. Callable custom/MCP tools are included unless limited with `tools`; hidden and model-only tools are excluded. Removed or disabled tools fail rather than falling back to unrestricted implementations. Fixed read-only helpers and optional web tools run locally in the child. Tool restrictions are not an OS sandbox; files read by a child go to its model provider.

PR snapshots use authenticated `gh`, without checking out or fetching refs. `pr_file` pins source to the saved head/base commits, including forks. `github_data` reads live comments, reviews, resolution/outdated status, checks and Actions jobs/logs, including Copilot feedback. Collections paginate; thread summaries cap comments at 100 and flag incomplete threads. Full inline history is available through comments. These reads cannot post, resolve threads or rerun pipelines. Remote evidence is live, not pinned to the saved diff.

## Storage and limits

Reports and logs live under `~/.pi/agent/mini-agents-runs/`; model settings use `~/.pi/agent/mini-agents-models.json`. Follow-ups update that agent's report and append to its bounded log. Only the last 500 log entries are retained. Delete old run directories manually.

Each execution times out after 30 minutes, including question waiting. Idle completed agents do not time out. Reload, session switch and shutdown close all children, invalidate queued tokens and suppress cross-session results. Live handles and IDs are session-local and are not restored after reload. Child token costs are not added to the parent's totals.

## Test

```bash
node --test pi-extensions/extensions/mini-agents/tests/*.test.mjs
```

Tests use Pi's installed SDK, local fake model servers and mocked GitHub reads. Set `PI_BIN` if Pi is not at `/opt/homebrew/bin/pi`. Terminal rendering still needs an interactive check.
