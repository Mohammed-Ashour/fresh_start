# Fresh macOS Setup

Modular macOS development environment setup with interactive menu and individual component support.

## Structure

```
fresh_start/
├── init_macos.sh          # Main setup script (interactive menu)
├── pi-extensions/         # Pi extensions only
│   ├── setup.sh
│   └── extensions/
│       ├── web-search.ts
│       ├── exit-command.ts
│       └── permissions.json
├── pi-setup/              # Full pi setup (config, MCP, extensions)
│   ├── setup.sh
│   ├── config/
│   │   ├── settings.json
│   │   └── mcp.json
│   └── extensions/
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
./init_macos.sh --category pi-extensions
./init_macos.sh --category pi-config
./init_macos.sh --category pi
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
| `productivity` | Productivity apps | Ghostty, Rectangle, Obsidian, Zen Browser |
| `kubernetes` | K8s tooling | Docker, kubectl, Helm, Minikube, K9s |
| `cli-tools` | Enhanced CLI | bat, eza, ripgrep, zellij |
| `pi-extensions` | Pi extensions only | web-search.ts, exit-command.ts, permissions.json |
| `pi-setup` | Pi settings + MCP | settings.json, mcp.json |
| `pi` | Full Pi setup | All pi components |

## Pi Setup Options

### Pi Extensions Only
```bash
./pi-extensions/setup.sh
```
Installs only the extensions:
- `web-search.ts` - Web search and fetch via DuckDuckGo
- `exit-command.ts` - `/exit` as alias for `/quit`
- `permissions.json` - Permission modes (acceptEdits by default)

### Pi Setup Only
```bash
./init_macos.sh --category pi-setup
```
Installs only configuration files:
- `settings.json` - Provider, model, thinking level, packages
- `mcp.json` - MCP server configuration (lod-mcp)

### Full Pi Setup
```bash
./init_macos.sh --category pi
```
Combines pi-extensions + pi-config + runs pi-setup/setup.sh

## Pi Extensions

### Web Search
Enables web search and fetch functionality using DuckDuckGo.

### Exit Command
Adds `/exit` as an alias for `/quit`.

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
