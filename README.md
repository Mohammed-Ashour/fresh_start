# Fresh macOS Setup

Modular macOS development environment setup with interactive menu and individual component support.

## Structure

```
fresh_start/
├── init_macos.sh          # Main setup script (interactive menu)
├── pi-extensions/         # Pi coding agent extensions
│   ├── setup.sh
│   └── extensions/
│       ├── ask-questions.ts
│       ├── context-usage.ts
│       ├── exit-command.ts
│       ├── permission-gate.ts
│       ├── permissions.json
│       ├── share-local.ts
│       └── web-search.ts
└── README.md
```

## Usage

### Interactive Menu (Default)
```bash
./init_macos.sh
```

### Install Everything
```bash
./init_macos.sh --all
```

### Install Specific Category
```bash
./init_macos.sh --category core
./init_macos.sh --category productivity
./init_macos.sh --category pi-extensions
```

### Dry Run (Preview)
```bash
./init_macos.sh --dry-run
```

## Categories

| Category | Description | Includes |
|----------|-------------|----------|
| `core` | Essential tools | Homebrew, Zsh, Oh My Zsh, Git |
| `dev-tools` | Development tools | VS Code, lazygit, fzf, tmux |
| `productivity` | Productivity apps | Ghostty, Rectangle, Obsidian, Zen Browser, Bitwarden |
| `kubernetes` | K8s tooling | Docker, kubectl, Helm, Minikube, K9s |
| `cli-tools` | Enhanced CLI | bat, eza, ripgrep, zellij |
| `pi-extensions` | Pi coding agent extensions | see below |

## Pi Extensions

### Install Extensions
```bash
./pi-extensions/setup.sh
```
Or via the main script:
```bash
./init_macos.sh --category pi-extensions
```

### Included Extensions

#### permission-gate.ts — Unified Permission Gate

Merged from `@rhedbull/pi-permissions` with custom enhancements. Controls what the agent can execute.

**6 Modes:**

| Mode | Write/Edit | Bash (safe) | Bash (dangerous) | Catastrophic |
|------|-----------|-------------|-------------------|--------------|
| `default` | ❓ Confirm | ❓ Confirm | ❓ Confirm | 🚫 Blocked |
| `acceptEdits` | ✅ Auto | ❓ Confirm | ❓ Confirm | 🚫 Blocked |
| `fullAuto` | ✅ Auto | ✅ Auto | ❓ Confirm | 🚫 Blocked |
| `safeMode` | ✅ Auto | ✅ Auto | ⛔ Silently blocked | 🚫 Blocked |
| `bypassPermissions` | ✅ Auto | ✅ Auto | ✅ Auto | 🚫 Blocked |
| `plan` | ✅ .md only | ✅ Read only | ⛔ Blocked | 🚫 Blocked |

**Commands:**

| Command | Description |
|---------|-------------|
| `/permissions` | Interactive mode selector |
| `/permissions <mode>` | Set mode directly (e.g., `/permissions safeMode`) |
| `/permissions-settings` | Show all settings (patterns, paths, commands) |
| `/permissions:status` | Show current mode + session allows |
| `Ctrl+Shift+P` | Cycle through modes |

**Features:**
- 22 dangerous patterns (`rm -rf`, `git push -f`, `kill -9`, etc.)
- 27 catastrophic patterns (always blocked in every mode)
- 21 protected paths (`~/.ssh`, `~/.aws`, `~/.kube/config`, etc.)
- 44 exempt commands (grep, find, cat, etc. skip all checks)
- 10 shell trick patterns (`$()` command substitution, `eval`, pipe-to-shell, etc.)
- Session approval ("Allow once" or "Allow for session")
- Status bar widget showing current mode

#### ask-questions.ts — Interactive Multi-Question Tool

Agent asks multiple questions with options, recommended answers, and custom input.

**Features:**
- multiple questions with sequential navigation
- ★ recommended answer indicator
- "Type something..." for custom answers
- "Skip this question" option
- ← → arrow keys to navigate between questions
- Cancel (Esc) returns partial answers

#### context-usage.ts — Context Usage Status Bar

Shows context window usage in the footer status bar.

- `ctx: 12% (24K/200K)` when under 50%
- `⚠ ctx: 58% (116K/200K)` when over 50%
- Updates on message, turn, model change, and session start

#### web-search.ts — Web Search & Fetch
- `web_search` — Search the web using DuckDuckGo
- `web_fetch` — Fetch content from URLs as markdown

#### exit-command.ts — `/exit` as alias for `/quit`

#### share-local.ts — Export Session to HTML
- `/share-local` — Export and open in Chrome
- `/share-local --path` — Show path only
- `/share-local --copy` — Copy path to clipboard

### Permission Patterns

**Catastrophic patterns** (always blocked): `rm -rf /`, `sudo mkfs`, `dd if=`, fork bombs, `\bshutdown\b`, `\bhalt\b`, `\bpoweroff\b`, disk overwrites

**Dangerous patterns** (blocked/prompted depending on mode): `rm -rf`, `chmod -R 777`, pipe-to-shell, `git push -f`, `kill -9`, `sudo tee /`, `eval(...)`, `bash -c $`

**Exempt commands** (skip all checks): `grep`, `rg`, `find`, `cat`, `head`, `tail`, `ls`, `pwd`, `echo`, `diff`, `jq`, `yq`, and 30+ more

**Protected paths** (write/edit always blocked): `~/.ssh`, `~/.aws`, `~/.gnupg`, `~/.kube/config`, `~/.pi/agent/auth.json`, and 16 more

## After Setup

### For Pi
```bash
# Reload pi to apply changes
/reload

# Or restart pi
pi
```

### For Zsh Changes
```bash
source ~/.zshrc
```