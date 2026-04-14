# Fresh macOS Setup

Modular macOS development environment setup with interactive menu and individual component support.

## Structure

```
fresh_start/
├── init_macos.sh          # Main setup script (interactive menu)
├── pi-extensions/         # Pi coding agent extensions
│   ├── setup.sh
│   └── extensions/
│       ├── web-search.ts
│       ├── exit-command.ts
│       ├── permission-gate.ts
│       ├── permissions.json
│       └── share-local.ts
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
| `pi-extensions` | Pi coding agent extensions | web-search, exit-command, permission-gate, share-local |

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

**web-search.ts** - Web search and fetch via DuckDuckGo
- `web_search` - Search the web using DuckDuckGo
- `web_fetch` - Fetch content from URLs as markdown

**exit-command.ts** - `/exit` as alias for `/quit`

**permission-gate.ts** - Permission gate for dangerous commands
- Blocks catastrophic commands (e.g., `rm -rf /`, `dd if=`, fork bombs)
- Confirms dangerous commands before running
- Protects sensitive paths from write/edit operations
- Supports three modes: `acceptEdits`, `confirmAll`, `blockAll`

**permissions.json** - Configuration for permission-gate.ts

**share-local.ts** - Export session to HTML and open locally
- `/share-local` - Export and open in Chrome
- `/share-local --path` - Show path only
- `/share-local --copy` - Copy path to clipboard

### Permission Modes

Configurable via `permissions.json`:

| Mode | Write | Normal Bash | Dangerous Bash | Catastrophic |
|------|-------|-------------|----------------|--------------|
| `acceptEdits` (default) | ✅ Auto | ❓ Confirm | ❓ Confirm | 🚫 Blocked |
| `confirmAll` | ✅ Auto | ❓ Confirm | ❓ Confirm | 🚫 Blocked |
| `blockAll` | 🚫 Blocked | 🚫 Blocked | 🚫 Blocked | 🚫 Blocked |

**Dangerous patterns** (require confirmation): `rm -rf`, `chmod -R 777`, `chown -R`, device writes

**Catastrophic patterns** (always blocked): `rm -rf /`, `sudo mkfs`, `dd if=`, fork bombs, disk overwrites

**Protected paths** (write/edit blocked): `~/.ssh`, `~/.aws`, `~/.gnupg`, `~/.kube/config`, `~/.pi/agent/auth.json`

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
