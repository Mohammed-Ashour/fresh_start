# Fresh macOS Setup

Modular macOS development environment setup with interactive multi-select pickers, guided prompts, per-category installs, and a real dry-run mode.

## Usage

```bash
./init_macos.sh                    # Choose categories in an interactive picker
./init_macos.sh --all              # Install all categories
./init_macos.sh --category core    # Install one category
./init_macos.sh --category zed     # Install Zed only
./init_macos.sh --force --all      # Overwrite installed Pi skills and extensions
./init_macos.sh --dry-run          # Preview changes without modifying your system
./init_macos.sh --help             # Show all options
```

### Notes

- `--dry-run` is non-destructive and prints the commands that would run.
- Without a TTY, pass `--all`, `--category <name>`, or explicit Pi item names.
- Homebrew setup supports both Apple Silicon (`/opt/homebrew`) and Intel (`/usr/local`) installs.
- You can combine `--dry-run` with `--all` or `--category <name>`.

## Categories

| Category | Includes |
|----------|----------|
| `core` | Homebrew, Zsh, Oh My Zsh, Powerlevel10k, Git |
| `dev-tools` | VS Code, lazygit, fzf, tmux |
| `zed` | Zed editor, bundled settings |
| `productivity` | Ghostty, Ghostty keybindings, Rectangle, Obsidian, Zen Browser, Bitwarden |
| `kubernetes` | Docker Desktop, lazydocker, kubectl, Helm, Minikube, K9s |
| `cli-tools` | bat, eza, ripgrep, zellij |
| `pi-extensions` | ask-questions, context-usage, exit-command, permission-gate, share-local, codex-accounts, diff-review, diff-review-web, mini-agents, pi-web-access |
| `pi-skills` | agdr-decide, agdr-visualize, architecture-context, codebase-cleanup-audit, deep-module-reviewer, frontend-skill, grill-me, handoff, mo-presentation, ponytail, ponytail-audit, ponytail-review, pr-review-guide, pr-splitter, review-story, science-pr-review, security-best-practices, show-me, simplify, skipper-audit, skipper-implement, skipper-review, skipper-review-deep, skipper-teach, skipper-test-coverage, unit-test-aaa, unslop |

## Pi Skills

Each skill is a directory containing a `SKILL.md` (plus optional `references/`, `agents/`, `scripts/` assets) copied into `~/.agents/skills/`:

```bash
./pi-skills/setup.sh                       # choose skills interactively
./pi-skills/setup.sh --all                 # install all skills
./pi-skills/setup.sh skipper-review        # install it and its required skills
./pi-skills/setup.sh --list                # show availability and install status
./pi-skills/setup.sh --all --dry-run       # preview all, change nothing
./pi-skills/setup.sh --all --force         # overwrite every installed skill copy
```

Each skill gets one status line: installed, updated, up to date, or kept because the installed copy has local changes. Selected skills automatically include their dependencies. The installer records the installed version so reruns can apply repository updates without overwriting later local edits. Or install through the main script:

```bash
./init_macos.sh --category pi-skills
```

### Zsh theme

The `core` category installs Powerlevel10k and a portable, minimal prompt configuration at `~/.p10k.zsh`. It keeps the directory, Git state, active Python/Node/Kubernetes context, command duration, and time visible using foreground colors without background blocks.

Existing `~/.p10k.zsh` files are preserved. The installer updates the `ZSH_THEME` line in `~/.zshrc` only after confirmation and adds the config source line if it is missing.

### Included skills

| Skill | Purpose |
|-------|--------|
| `agdr-decide` | Enforce Agent Decision Record workflow for non-trivial decisions |
| `agdr-visualize` | Generate a visual flow diagram and table of all AgDRs |
| `architecture-context` | Generate/update `ARCHITECTURE.md` from code evidence |
| `codebase-cleanup-audit` | Repo-wide cleanup audit for dead code and unused deps |
| `deep-module-reviewer` | Review code for shallow modules (Ousterhout) |
| `frontend-skill` | Visually strong landing pages, apps, and UI |
| `grill-me` | Stress-test a plan or design via relentless questioning |
| `handoff` | Compact the conversation into a handoff document |
| `mo-presentation` | Story-driven, sourced, editable PowerPoint decks: golden-ratio layouts, native charts with callouts, GIFs for change |
| `ponytail` | Force the laziest solution that actually works |
| `ponytail-audit` | Whole-repo audit for over-engineering |
| `ponytail-review` | Code review focused on over-engineering |
| `pr-review-guide` | Reviewer guide for long or hard-to-review PRs |
| `pr-splitter` | Split oversized PRs into smaller scoped PRs |
| `review-story` | Concise narrative walkthrough of PR changes |
| `science-pr-review` | Stage 0-5 science-model lifecycle gate; used by skipper-review on science PRs |
| `security-best-practices` | Language/framework security best-practice reviews |
| `show-me` | Explain a topic visually with diagrams, code sketches, and small HTML artifacts |
| `simplify` | Review recent changes for reuse, quality, efficiency |
| `skipper-audit` | Evidence-based health audit of a repo or subsystem |
| `skipper-implement` | Smallest safe change for Python, Airflow, geospatial, Terraform, k8s, CI/CD |
| `skipper-review` | Review a PR, diff, branch, or commit for correctness, safety, and complexity |
| `skipper-review-deep` | Line-by-line deep review, building on skipper-review |
| `skipper-teach` | One focused offline HTML lesson on a data or platform engineering topic |
| `skipper-test-coverage` | Behavior-level test coverage assessment with ranked gaps |
| `unit-test-aaa` | Write pytest tests in Arrange-Act-Assert pattern |
| `unslop` | Cut AI tells from any writing |

## Pi Extensions

Extensions are copied into `~/.pi/agent/extensions/`, then the `npm:pi-web-access` package is installed through `pi`:

```bash
./pi-extensions/setup.sh                   # choose extensions interactively
./pi-extensions/setup.sh --all             # install all extensions + pi-web-access
./pi-extensions/setup.sh mini-agents       # install it + required pi-web-access
./pi-extensions/setup.sh codex-accounts    # install ChatGPT account management
./pi-extensions/setup.sh --list            # show availability and install status
./pi-extensions/setup.sh --all --dry-run   # preview all, change nothing
./pi-extensions/setup.sh --all --force     # overwrite every installed extension copy
```

Same status lines and safe update tracking as the skills script. It also warns when `pi` or an authenticated `gh` (for mini-agents PR reviews) is missing. `--all` and the interactive picker also install the `/commit` and `/pr` prompt templates from `pi-extensions/prompts/`. Package versions are pinned on purpose; bump them deliberately.

```bash
./pi-extensions/test.sh                    # run every extension's tests (+ type check when tsc is available)
./pi-extensions/prune-sessions.sh          # show sessions/exports older than 90 days
./pi-extensions/prune-sessions.sh --apply  # delete them (sessions can contain secrets)
```

Or install through the main script:

```bash
./init_macos.sh --category pi-extensions
```

### Included extensions and packages

**Permission Gate**
- modes: `plan`, `default`, `acceptEdits`, `safeMode` (default), `bypassPermissions`
- safe mode stays quiet for normal work and asks only for risky actions (force push, discarding uncommitted changes, deleting outside the project, publishing, destroying infrastructure)
- blocks catastrophic commands and secret paths (`~/.ssh`, `~/.aws`, auth files) in every mode, including through `read`/`grep`
- parses shell commands, so `echo ok; rm -rf ~`, `bash -c`, `$(...)` and `xargs` cannot hide anything
- optional macOS sandbox for bash (`"sandbox": true`)
- `/permissions`, `/permissions-explain <command>`, `/sandbox`; `Ctrl+Shift+P` cycles modes
- config: `~/.pi/agent/permissions.json`; see [its README](pi-extensions/extensions/permission-gate/README.md)

**Ask Questions**
- multi-question UI
- optional recommended answers with `★`
- custom answers and skip support

**Context Usage**
- footer bar colored by what fills the context (system prompt, tools, memory files, skills, messages, tool results): `ctx ███████████░░░░░░░░▒ 33% 91K/272K  ●system ●chat ●output` (system = prompt, tools, memory files, skills; chat = messages; output = tool results)
- yellow past 50%, red past 80%; past 60% it shows the room left before auto-compaction (`compact in 28%`)
- `/context`: Claude Code-style breakdown with a 10×10 grid, tokens per category, memory files, skills, largest tools, and message counts

**Codex Accounts**
- `/codex` manages several ChatGPT accounts using the same native sign-in as `/login`
- normal `openai-codex` models rotate accounts on quota exhaustion without replacing core credentials or rewriting startup settings
- account picker marks current, next and default accounts; Tab completes `/codex use`, `default` and `remove`
- session switching and the default for new sessions are separate actions
- `/codex-usage` shows remaining short-window and weekly quota, reset times and stale-data warnings
- compact footer with the selected account, remaining quota and confirmed-ready count
- details in `pi-extensions/extensions/codex-accounts/README.md`

**Web Access**
- installed from the LazyPi stack via `npm:pi-web-access`
- provides `web_search`, `code_search`, `fetch_content`, and `get_search_content`
- upstream package: `nicobailon/pi-web-access`
- optional extras for richer video support: `ffmpeg`, `yt-dlp`

**Exit Command**
- `/exit` alias for `/quit`

**Share Local**
- `/share-local` exports the current session to HTML
- opens locally using a supported browser or OS opener when available
- supports `--path` and `--copy`

**Diff Review**
- `/diff-review` reviews the current working tree diff in-TUI
- `/diff-review --cached` reviews staged changes
- `/diff-review main...HEAD` reviews a custom git diff range
- `/diff-review-theme` switches to the bundled GitHub-like theme

**Diff Review Web**
- `/diff-review-web` opens the current working tree diff in a browser
- inline per-line comments, then **End review** loads notes back into pi
- `/diff-review-web --cached` reviews staged changes
- `/diff-review-web main...HEAD` reviews a custom diff range
- `/diff-review-web-stop` stops the localhost review server

**Mini Agents**
- `/mini-agents <name>: <purpose>` starts a named background agent; the main model can create and manage the same agents with `mini_agents`
- every agent appears in the UI with shared `list`, `peek`, `message`, `reply`, and `stop` controls
- completed agents retain their conversation for follow-up messages
- read-only by default; `--write` adds the parent's callable tools with live permission checks in the shared checkout
- `--web` adds pi-web-access; `--pr` pins a committed PR snapshot through authenticated `gh`
- `--context` includes the parent conversation; `model` saves one model default
- your enabled skills drive the work; results and questions appear in the chat
- replaces `/reviewers`, `/researchers` and `/implementer`; see `pi-extensions/extensions/mini-agents/README.md`

## After Setup

```bash
/reload           # Apply pi extension and skill changes
source ~/.zprofile
source ~/.zshrc
```
