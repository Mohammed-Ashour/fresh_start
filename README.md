# Fresh macOS Setup

Modular macOS development environment setup with interactive menu and individual component support.

## Usage

```bash
./init_macos.sh              # Interactive menu
./init_macos.sh --all        # Install everything
./init_macos.sh --category core  # Install specific category
./init_macos.sh --dry-run    # Preview only
```

## Categories

| Category | Includes |
|----------|----------|
| `core` | Homebrew, Zsh, Oh My Zsh, Git |
| `dev-tools` | VS Code, lazygit, fzf, tmux |
| `productivity` | Ghostty, Rectangle, Obsidian, Zen Browser, Bitwarden |
| `kubernetes` | Docker, kubectl, Helm, Minikube, K9s |
| `cli-tools` | bat, eza, ripgrep, zellij |
| `pi-extensions` | permission-gate, ask-questions, context-usage, web-search, exit-command, share-local |

## Pi Extensions

```bash
./pi-extensions/setup.sh
# or
./init_macos.sh --category pi-extensions
```

**Permission Gate** — 6 modes (default/acceptEdits/fullAuto/safeMode/bypassPermissions/plan), catastrophic/dangerous pattern blocking, protected paths, exempt commands, session approval. `/permissions` to switch modes, `Ctrl+Shift+P` to cycle.

**Ask Questions** — Multi-question UI with ★ recommended answers, custom input, and skip option.

**Context Usage** — Footer status bar showing context % with ⚠ at 50%+.

**Web Search** — `web_search` + `web_fetch` via DuckDuckGo.

**Exit Command** — `/exit` alias for `/quit`.

**Share Local** — `/share-local` export session to HTML.

## After Setup

```bash
/reload      # Apply pi extension changes
source ~/.zshrc  # Apply zsh changes
```