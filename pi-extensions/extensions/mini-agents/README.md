# Mini agents

Background reviewers and researchers for Pi. No added dependencies.

## Use

Run `/reload` in Pi or restart it.

```text
/reviewers skipper review the current PR
/reviewers deep review https://github.com/Hydrosat/hywater-pipelines/pull/368
/reviewers check test coverage of src/hydrosat/hywater/cli/shared/
/reviewers                      # prompt; blank reviews uncommitted changes
/researchers Compare pytest fixture scopes
```

- `/reviewers help`, `/researchers help`: show all commands, usage tips, the saved model, and active runs.
- `/reviewers model`, `/researchers model`: search for and save each workflow's model.
- `/reviewers stop`, `/researchers stop`: cancel a run. With several runs, pick one or All.
- `/reviewers peek`, `/researchers peek`: pick an active job and watch its live log (tool calls with arguments, errors, and text as it is written). `↑↓`/PgUp/PgDn scroll, End resumes following, Esc or `q` closes. Closing the view never stops the agent.

Runs start in the background and return control immediately. Reviews and research can run at the same time, as many as you like. One widget above the editor shows every active job:

```text
● #1 review · reviewer        1m 4s  Using pr_file
● #2 research · sources         12s  Using web_search
● #2 research · countercheck    12s  Thinking
```

Each run posts its result to the conversation when it finishes. Results do not trigger a parent model turn.

Type `/reviewers ` or `/researchers ` to autocomplete `model`, `peek`, `stop`, `help`, and `--context`.

## Context

Agents start fresh by default: they see your request, skills, and AGENTS.md, not this chat. Add `--context` anywhere in the request to include the current conversation as background:

```text
/reviewers --context skipper review the current PR, focus on what we discussed
/researchers --context is this approach standard?
```

Included: user and assistant messages, earlier agent results, and compaction summaries. Tool output is left out, and only the latest 60k characters are kept. The result notes when context was included.

## Skills

Children see the exact skills enabled in your session, and AGENTS.md files load as usual. Nothing is preloaded: the reviewer reads your request, picks the skills that fit (`skipper review` → `skipper-review`, `deep review` → `skipper-review-deep`), and follows their workflow and output format. Researchers do the same.

Children have read-only tools. When a skill calls for running tests, editing, or delegating, the child skips that step and says so.

## PR reviews

A PR URL, "current PR", "this PR", or "PR #368" reviews the committed PR, not your working tree. The current branch and PR numbers resolve with `gh pr view` from the project directory. Requires an authenticated `gh` CLI.

The extension saves the diff once, verifies the revision and file count, and gives the reviewer a `pr_file` tool pinned to the PR head and base commits, including forks. It never checks out branches, fetches refs, or posts to GitHub.

## Files and limits

Reports, per-job logs, and PR diffs are saved under `~/.pi/agent/mini-agents-runs/`; each result links its report and log folder. Delete old runs manually. Model defaults live in `~/.pi/agent/mini-agents-models.json`.

Runs stop after 30 minutes. Closing, reloading, or switching sessions cancels active runs and saves partial results without posting them to another session. Child token usage is not added to the parent's cost totals.

Tool restrictions are not an OS sandbox. Files the child reads go to the selected model provider.

## Test

```bash
node --test ~/.pi/agent/extensions/mini-agents/tests/*.test.mjs
```

Uses a local fake model server and mocked GitHub reads. Set `PI_BIN` if Pi is not at `/opt/homebrew/bin/pi`.
