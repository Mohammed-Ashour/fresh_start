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
| `pi-extensions` | ask-questions, context-usage, exit-command, permission-gate, share-local, pi-web-access |

## Pi Extensions

Install all Pi extensions directly. Running without flags opens an interactive chooser:

```bash
./pi-extensions/setup.sh
```

Useful options:

```bash
./pi-extensions/setup.sh --dry-run
./pi-extensions/setup.sh --force
./pi-extensions/setup.sh --help
```

Or install them through the main setup script:

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

## After Setup

```bash
/reload           # Apply pi extension changes
source ~/.zprofile
source ~/.zshrc
```
