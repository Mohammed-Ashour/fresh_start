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
│       └── permissions.json
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
| `pi-extensions` | Pi coding agent extensions | web-search, exit-command, permissions |

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

**exit-command.ts** - `/exit` as alias for `/quit`

**permissions.json** - Permission modes (acceptEdits by default)

### Permission Modes

Claude Code-style permission modes:

| Mode | Write | Normal Bash | Dangerous Bash | Catastrophic |
|------|-------|-------------|----------------|--------------|
| `default` | ❓ Confirm | ❓ Confirm | ❓ Confirm | 🚫 Blocked |
| `acceptEdits` | ✅ Auto | ❓ Confirm | ❓ Confirm | 🚫 Blocked |
| `fullAuto` | ✅ Auto | ✅ Auto | ❓ Confirm | 🚫 Blocked |
| `bypassPermissions` | ✅ Auto | ✅ Auto | ✅ Auto | 🚫 Blocked |

Commands:
- `/permissions` - Interactive mode selector
- `/permissions <mode>` - Set mode directly
- `/permissions:status` - Show current mode

Keyboard: **Ctrl+Shift+P** — Cycle through modes

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
