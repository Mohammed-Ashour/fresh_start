# Fresh macOS Setup

Modular macOS development environment setup with an interactive menu, guided install prompts, per-category installs, and a real dry-run mode.

## Usage

```bash
./init_macos.sh                    # Interactive guided menu
./init_macos.sh --all              # Install all categories
./init_macos.sh --category core    # Install one category
./init_macos.sh --category zed     # Install Zed only
./init_macos.sh --dry-run          # Preview changes without modifying your system
./init_macos.sh --help             # Show all options
```

### Notes

- `--dry-run` is non-destructive and prints the commands that would run.
- Homebrew setup supports both Apple Silicon (`/opt/homebrew`) and Intel (`/usr/local`) installs.
- You can combine `--dry-run` with `--all` or `--category <name>`.

## Categories

| Category | Includes |
|----------|----------|
| `core` | Homebrew, Zsh, Oh My Zsh, Git |
| `dev-tools` | VS Code, lazygit, fzf, tmux |
| `zed` | Zed editor, bundled settings |
| `productivity` | Ghostty, Ghostty keybindings, Rectangle, Obsidian, Zen Browser, Bitwarden |
| `kubernetes` | Docker Desktop, lazydocker, kubectl, Helm, Minikube, K9s |
| `cli-tools` | bat, eza, ripgrep, zellij |
| `pi-extensions` | ask-questions, context-usage, exit-command, permission-gate, share-local, diff-review, diff-review-web, mini-agents, pi-web-access |
| `pi-skills` | agdr-decide, agdr-visualize, architecture-context, codebase-cleanup-audit, deep-module-reviewer, frontend-skill, grill-me, handoff, humanizer, ponytail, ponytail-audit, ponytail-review, pr-rev-guide, pr-review-guide, pr-reviewer, pr-splitter, review, review-story, science-pr-review, security-best-practices, show-me, simplify, skipper-audit, skipper-implement, skipper-review, skipper-review-deep, skipper-teach, skipper-test-coverage, unit-test-aaa, unslop |

## Pi Skills

Each skill is a directory containing a `SKILL.md` (plus optional `references/`, `agents/`, `scripts/` assets) copied into `~/.agents/skills/`:

```bash
./pi-skills/setup.sh                       # install all skills
./pi-skills/setup.sh skipper-review unslop # install only these
./pi-skills/setup.sh --list                # what's available and what's installed
./pi-skills/setup.sh --dry-run             # preview, change nothing
./pi-skills/setup.sh --force               # also replace copies you edited locally
```

Each skill gets one status line: installed, updated, up to date, or kept because the installed copy has local changes. Reruns are safe and only copy what changed. Or install through the main script:

```bash
./init_macos.sh --category pi-skills
```

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
| `humanizer` | Remove signs of AI-generated writing |
| `ponytail` | Force the laziest solution that actually works |
| `ponytail-audit` | Whole-repo audit for over-engineering |
| `ponytail-review` | Code review focused on over-engineering |
| `pr-rev-guide` | Generate and post a structured PR review guide |
| `pr-review-guide` | Reviewer guide for long or hard-to-review PRs |
| `pr-reviewer` | In-depth PR and branch review with severity-ranked findings |
| `pr-splitter` | Split oversized PRs into smaller scoped PRs |
| `review` | Correctness-focused code review |
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
./pi-extensions/setup.sh                   # install all extensions + pi-web-access
./pi-extensions/setup.sh mini-agents       # install only these
./pi-extensions/setup.sh --list            # what's available and what's installed
./pi-extensions/setup.sh --dry-run         # preview, change nothing
./pi-extensions/setup.sh --force           # also replace copies you edited locally
```

Same status lines as the skills script. It also warns when `pi` or an authenticated `gh` (for mini-agents PR reviews) is missing. Or install through the main script:

```bash
./init_macos.sh --category pi-extensions
```

### Included extensions and packages

**Permission Gate**
- 6 modes: `default`, `acceptEdits`, `fullAuto`, `safeMode`, `bypassPermissions`, `plan`
- catastrophic and dangerous command blocking
- protected path blocking
- exempt command support
- session-scoped approvals
- `/permissions` to switch modes
- `Ctrl+Shift+P` to cycle modes
- default shipped config: `safeMode`

**Ask Questions**
- multi-question UI
- optional recommended answers with `★`
- custom answers and skip support

**Context Usage**
- footer status bar showing current context usage
- warning indicator at 50%+

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
- `/reviewers <request>` runs a background code review, e.g. `/reviewers skipper review the current PR`
- `/researchers <question>` runs two background researchers: one gathers sources, one looks for counterevidence
- your skills drive the work: name the style you want, e.g. "skipper review" or "deep review"
- PR URL, "current PR", or "PR #n" reviews the committed PR through `gh`, without checking it out
- reviews and research run concurrently and post results to the chat when done
- `--context` adds the current conversation as background; agents start fresh by default
- subcommands: `model`, `peek` (live log), `stop`, `help`, with autocomplete
- read-only: agents never edit files, run commands, or post to GitHub
- needs `pi-web-access` for research and an authenticated `gh` for PR reviews; see `pi-extensions/extensions/mini-agents/README.md`

## After Setup

```bash
/reload           # Apply pi extension and skill changes
source ~/.zprofile
source ~/.zshrc
```
