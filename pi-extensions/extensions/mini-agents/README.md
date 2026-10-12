# Mini agents

Background reviewers, researchers, and an implementer for Pi. No added dependencies.

## Use

Run `/reload` in Pi or restart it.

```text
/reviewers skipper review the current PR
/reviewers deep review https://github.com/Hydrosat/hywater-pipelines/pull/368
/reviewers check test coverage of src/hydrosat/hywater/cli/shared/
/reviewers                      # prompt; blank reviews uncommitted changes
/researchers Compare pytest fixture scopes
/implementer --context add tests for the parser
/implementer reply Use the existing pytest fixtures
```

- `/reviewers help`, `/researchers help`: show all commands, usage tips, the saved model, and active runs.
- `/reviewers model`, `/researchers model`: search for and save each workflow's model.
- `/reviewers stop`, `/researchers stop`: cancel a run. With several runs, pick one or All.
- `/reviewers peek`, `/researchers peek`, `/implementer peek`: pick a job and show its last eight log lines in a live panel above the editor. You can keep typing and using your main session. The panel stays visible after completion.
- `/<command> peek close`: close the panel without stopping the job.
- `/<command> peek log`: open the full scrollable log of an active job. `↑↓`/PgUp/PgDn scroll, End follows, Esc or `q` returns to your session.
- `/implementer reply [answer]`: answer the implementer's pending question. Without an answer, opens an input prompt. Questions notify you and pause the child without opening a dialog automatically.

`/implementer` also supports `model`, `help`, `stop`, and `--context`. Starting asks for confirmation because it can edit, write, and run shell commands in your current checkout. Only one implementer can run at a time. Avoid editing the same files from the main session. The implementer calls the main session's live tool executor, including its permission and result hooks. Callable custom and MCP tools are available through the same boundary. Changing `/permissions` also affects the running implementer. Disabled or removed tools remain unavailable; there is no fallback to unrestricted child tools. Cancellation stops further work but does not undo edits. Review its changes before committing.

Reviewer and researcher runs start in the background and return control immediately. Implementer startup requests a short main-session turn to call `mini_agents_start_implementer` with a one-use token. If the parent is busy, startup queues after its current turn. The startup tool must be enabled in your tool configuration. Startup expires after one minute if the tool has not been called; retry the command if needed. Once started, implementation runs in the background. Reviews and research can run at the same time, as many as you like. One widget above the editor shows every active job:

```text
● #1 review · reviewer        1m 4s  Using pr_file
● #2 research · sources         12s  Using web_search
● #2 research · countercheck    12s  Thinking
```

Each run posts its result to the conversation when it finishes. Results do not trigger a parent model turn.

Type `/reviewers ` or `/researchers ` to autocomplete `model`, `peek`, `stop`, `help`, and `--context`.

## Context

Agents start with a fresh conversation by default. They see your request, skills, and AGENTS.md, not this chat. The implementer also inherits the parent's effective system instructions and settings. Add `--context` anywhere in the request to include the current conversation as background:

```text
/reviewers --context skipper review the current PR, focus on what we discussed
/researchers --context is this approach standard?
```

Included: user and assistant messages, earlier agent results, and compaction summaries. Tool output is left out, and only the latest 60k characters are kept. The result notes when context was included.

## Skills

Children see the exact skills enabled in your session, and AGENTS.md files load as usual. Nothing is preloaded: the reviewer reads your request, picks the skills that fit (`skipper review` → `skipper-review`, `deep review` → `skipper-review-deep`), and follows their workflow and output format. Researchers do the same.

Reviewers and researchers have read-only tools. When a skill calls for running tests, editing, or delegating, they skip that step and say so. The implementer proxies the parent's callable tools and adds `ask_user`. Hidden and model-only tools are not callable through Pi's nested executor, so they are excluded. Use `ask_user` for questions instead. The startup tool is model-only and requires a live user-created token, so the child cannot recursively start another implementer. Permission approval dialogs still use the main UI, just as they do for main-session calls.

## PR reviews

A PR URL, "current PR", "this PR", or "PR #368" reviews the committed PR, not your working tree. The current branch and PR numbers resolve with `gh pr view` from the project directory. Requires an authenticated `gh` CLI.

The extension saves the diff once, verifies the revision and file count, and gives the reviewer a `pr_file` tool pinned to the PR head and base commits, including forks. It never checks out branches, fetches refs, or posts to GitHub.

Reviewers also have `github_data`, using your authenticated `gh` CLI to read conversation and inline comments, reviews, review-thread resolution and outdated status, commit checks/statuses, Actions runs, jobs, and logs. This includes Copilot comments. REST collections and review threads are paginated; thread summaries include up to 100 comments per thread and flag incomplete threads. Full inline history is available through the comments operation. Large responses use line offsets and limits. These reads are live, not pinned to the saved diff. Authentication and permission errors are reported rather than treated as missing feedback. No arbitrary API queries, posting, thread resolution, or pipeline reruns are allowed.

## Files and limits

Reports, per-job logs, and PR diffs are saved under `~/.pi/agent/mini-agents-runs/`; each result links its report and log folder. Delete old runs manually. Model defaults live in `~/.pi/agent/mini-agents-models.json`.

Runs stop after 30 minutes, including time spent waiting for replies. Closing, reloading, or switching sessions cancels active runs and saves partial results without posting them to another session. Child token usage is not added to the parent's cost totals.

Tool restrictions are not an OS sandbox. Files the child reads go to the selected model provider.

## Test

```bash
node --test ~/.pi/agent/extensions/mini-agents/tests/*.test.mjs
```

Uses a local fake model server and mocked GitHub reads. Set `PI_BIN` if Pi is not at `/opt/homebrew/bin/pi`.
