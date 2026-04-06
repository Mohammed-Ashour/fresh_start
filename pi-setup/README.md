# Pi Setup

Personalized setup for the [pi coding agent](https://github.com/badlogic/pi-mono).

## What's Included

### Extensions

| Extension | Description |
|-----------|-------------|
| `web-search.ts` | Web search and fetch tools using DuckDuckGo API |
| `permissions.json` | Configuration for `@rhedbull/pi-permissions` |
| `exit-command.ts` | `/exit` command as alias for `/quit` |

### Settings

- **Default Provider**: OpenCode Go
- **Default Model**: MiniMax M2.7
- **Thinking Level**: Medium

### NPM Packages

- `@rhedbull/pi-permissions` - Claude Code-style permission modes
- `pi-mcp-adapter` - MCP protocol adapter

### MCP Servers

- `lod-mcp` - Luxembourgish Dictionary (local)

## Quick Start

```bash
cd ~/workspace/pi-setup
./setup.sh
```

## Usage

```bash
# Interactive setup (default)
./setup.sh

# Show what would be done without making changes
./setup.sh --dry-run

# Overwrite existing files
./setup.sh --force
```

## After Setup

1. **Restart pi** or run `/reload`
2. **Install npm packages**:
   ```bash
   npm install -g @rhedbull/pi-permissions pi-mcp-adapter
   ```
3. **Configure MCP server path** in `config/mcp.json` if needed

## Permission Modes

The `@rhedbull/pi-permissions` extension provides Claude Code-style permission modes:

| Mode | Status | Write/Edit | Normal Bash | Dangerous Bash | Catastrophic |
|------|--------|-----------|-------------|---------------|--------------|
| `default` | `⏵` | ❓ Confirm | ❓ Confirm | ❓ Confirm | 🚫 Blocked |
| `acceptEdits` | `⏵⏵` | ✅ Auto | ❓ Confirm | ❓ Confirm | 🚫 Blocked |
| `fullAuto` | `⏵⏵⏵` | ✅ Auto | ✅ Auto | ❓ Confirm | 🚫 Blocked |
| `bypassPermissions` | `⏵⏵⏵⏵` | ✅ Auto | ✅ Auto | ✅ Auto | 🚫 Blocked |

### Commands

| Command | Description |
|---------|-------------|
| `/permissions` | Interactive mode selector |
| `/permissions <mode>` | Set mode directly |
| `/permissions:status` | Show current mode |

### Keyboard Shortcut

**Ctrl+Shift+P** — Cycle through permission modes

## Directory Structure

```
pi-setup/
├── README.md           # This file
├── setup.sh            # Setup script
├── remove.sh           # Uninstall script
├── extensions/         # Pi extensions
│   ├── web-search.ts
│   └── permissions.json
└── config/             # Configuration files
    ├── settings.json
    └── mcp.json
```

## Adding New Extensions

1. Copy the extension file to `extensions/`
2. Run `./setup.sh` to install
3. Restart pi or run `/reload`

## Customizing Settings

Edit `config/settings.json` to change:
- Default provider and model
- Thinking level
- Packages to install

## Troubleshooting

### Extensions not loading
- Run `/reload` in pi
- Check for errors with `pi --verbose`

### MCP server not connecting
- Verify the command path in `config/mcp.json`
- Check the MCP server is running

## References

- [pi documentation](https://github.com/badlogic/pi-mono)
- [pi extensions guide](https://github.com/badlogic/pi-mono/blob/main/docs/extensions.md)
- [pi packages](https://www.npmjs.com/search?q=keywords%3Api-package)
- [@rhedbull/pi-permissions](https://github.com/rHedBull/pi-permissions)
