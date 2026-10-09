#!/bin/bash
#
# pi-extensions/setup.sh - Setup script for pi coding agent extensions only
#
# This script sets up ONLY the extensions for pi coding agent.
# For full pi setup (settings, MCP, etc.), use: ./pi-setup/setup.sh
#
# Extensions included:
# - exit-command.ts: /exit as alias for /quit
# - permission-gate.ts: Permission gate for dangerous commands (uses permissions.json)
# - permissions.json: Permission modes configuration for permission-gate.ts
# - share-local.ts: Export session to HTML and open browser preview
# - ask-questions.ts: Multi-question picker tool
# - context-usage.ts: Context usage footer
# - diff-review/: /diff-review in-TUI git diff review
# - diff-review-web/: /diff-review-web browser-based diff review
#
# Pi package installed:
# - npm:pi-web-access (replaces legacy local web-search.ts)
#
# Usage:
#   ./setup.sh              # Interactive mode
#   ./setup.sh --dry-run    # Show what would be done
#   ./setup.sh --force      # Overwrite existing files

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Paths
PI_DIR="${PI_CODING_AGENT_DIR:-$HOME/.pi/agent}"
SETUP_DIR="$(cd "$(dirname "$0")" && pwd)"

# Options
DRY_RUN=false
FORCE=false

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --dry-run)
            DRY_RUN=true
            shift
            ;;
        --force)
            FORCE=true
            shift
            ;;
        --help|-h)
            echo "Usage: $0 [options]"
            echo ""
            echo "Options:"
            echo "  --dry-run    Show what would be done without making changes"
            echo "  --force      Overwrite existing files"
            echo "  --help       Show this help message"
            exit 0
            ;;
        *)
            echo "Unknown option: $1"
            exit 1
            ;;
    esac
done

echo -e "${CYAN}╔════════════════════════════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║           Pi Extensions Setup (Extensions Only)             ║${NC}"
echo -e "${CYAN}╚════════════════════════════════════════════════════════════════╝${NC}"
echo ""

# Check if pi agent directory exists
if [[ ! -d "$PI_DIR" ]]; then
    echo -e "${YELLOW}⚠ Pi agent directory not found: $PI_DIR${NC}"
    echo "    This script only sets up extensions. Please install pi first."
    echo "    For full pi setup, run: ./pi-setup/setup.sh"
    exit 1
fi

# Function to copy files
copy_file() {
    local src="$1"
    local dest="$2"
    local description="$3"
    
    if [[ ! -f "$src" ]]; then
        echo -e "${YELLOW}⚠ Skipping $description (source not found: $src)${NC}"
        return 1
    fi
    
    # Create destination directory if needed
    local dest_dir=$(dirname "$dest")
    if [[ ! -d "$dest_dir" ]]; then
        echo -e "  Creating directory: $dest_dir"
        if [[ "$DRY_RUN" == "false" ]]; then
            mkdir -p "$dest_dir"
        fi
    fi
    
    # Check if file exists
    if [[ -f "$dest" && "$FORCE" == "false" ]]; then
        echo -e "${YELLOW}⚠ Skipping $description (already exists: $dest)${NC}"
        echo -e "    Use --force to overwrite"
        return 0
    fi
    
    echo -e "  ${GREEN}✓${NC} $description"
    if [[ "$DRY_RUN" == "false" ]]; then
        cp "$src" "$dest"
    fi
    return 0
}

# Function to install a single extension (file or directory)
install_extension() {
    local src="$1"
    local name=$(basename "$src")
    local dest="$PI_DIR/extensions/$name"

    if [[ ! -e "$src" ]]; then
        echo -e "  ${RED}✗${NC} Extension not found: $src"
        return 1
    fi

    # Skip disabled backups (e.g. web-search.ts.disabled)
    if [[ "$name" == *.disabled ]]; then
        return 0
    fi

    local exists=false
    if [[ -d "$src" ]]; then
        [[ -d "$dest" ]] && exists=true
    else
        [[ -f "$dest" ]] && exists=true
    fi

    if [[ "$exists" == true && "$FORCE" == "false" ]]; then
        echo -e "  ${YELLOW}↺${NC} $name (already installed, use --force to update)"
        return 0
    fi

    echo -e "  ${GREEN}→${NC} $name"
    if [[ "$DRY_RUN" == "false" ]]; then
        if [[ -d "$src" ]]; then
            rm -rf "$dest"
            cp -R "$src" "$dest"
        else
            cp "$src" "$dest"
        fi
    fi
    return 0
}

echo -e "${BLUE}▸ Extensions${NC}"
echo "  Source: $SETUP_DIR/extensions/"
echo "  Target: $PI_DIR/extensions/"
echo ""

if [[ ! -d "$PI_DIR/extensions" ]]; then
    echo -e "  Creating directory: $PI_DIR/extensions"
    if [[ "$DRY_RUN" == "false" ]]; then
        mkdir -p "$PI_DIR/extensions"
    fi
fi

# Count extensions (ignore disabled backups like *.disabled)
if [[ -d "$SETUP_DIR/extensions" && -n "$(ls -A "$SETUP_DIR/extensions" 2>/dev/null)" ]]; then
    # Count active extensions: files (*.ts/*.json, excluding *.disabled) and directories
    EXTENSION_FILE_COUNT=$(find "$SETUP_DIR/extensions" -maxdepth 1 -type f \( -name "*.ts" -o -name "*.json" \) ! -name "*.disabled" | wc -l | tr -d ' ')
    EXTENSION_DIR_COUNT=$(find "$SETUP_DIR/extensions" -maxdepth 1 -mindepth 1 -type d | wc -l | tr -d ' ')
    EXTENSION_COUNT=$((EXTENSION_FILE_COUNT + EXTENSION_DIR_COUNT))
    echo "  Found $EXTENSION_COUNT extension(s) to install:"

    # Install every top-level item (files and directory extensions), skipping disabled backups
    for item in "$SETUP_DIR/extensions"/*; do
        [[ -e "$item" ]] || continue
        install_extension "$item"
    done
else
    echo -e "  ${YELLOW}⚠ No extensions found in $SETUP_DIR/extensions/${NC}"
fi

echo ""

echo -e "${BLUE}▸ Pi package${NC}"
if ! command -v pi &>/dev/null; then
    echo -e "  ${YELLOW}⚠ Skipping npm:pi-web-access (pi command not found)${NC}"
elif [[ "$DRY_RUN" == "true" ]]; then
    echo "  Would run: pi install npm:pi-web-access"
else
    echo -e "  ${GREEN}→${NC} Installing npm:pi-web-access"
    if ! pi install npm:pi-web-access; then
        echo -e "  ${YELLOW}⚠ Failed to install npm:pi-web-access${NC}"
    fi
fi

echo ""

# Summary
INSTALLED_COUNT=0
SKIPPED_COUNT=0

if [[ "$DRY_RUN" == "false" ]]; then
    for item in "$PI_DIR/extensions"/*; do
        if [[ -f "$item" || -d "$item" ]]; then
            name=$(basename "$item")
            [[ "$name" == *.disabled ]] && continue
            case "$name" in
                exit-command.ts)
                    echo -e "  ${GREEN}✓${NC} exit-command.ts - /exit as alias for /quit"
                    ((INSTALLED_COUNT++))
                    ;;
                permission-gate.ts)
                    echo -e "  ${GREEN}✓${NC} permission-gate.ts - Dangerous command gate (uses permissions.json)"
                    ((INSTALLED_COUNT++))
                    ;;
                permissions.json)
                    echo -e "  ${GREEN}✓${NC} permissions.json - Permission modes configuration"
                    echo "      Mode: safeMode (dangerous commands blocked by default)"
                    ((INSTALLED_COUNT++))
                    ;;
                share-local.ts)
                    echo -e "  ${GREEN}✓${NC} share-local.ts - Export session to HTML and open locally"
                    ((INSTALLED_COUNT++))
                    ;;
                diff-review)
                    echo -e "  ${GREEN}✓${NC} diff-review/ - /diff-review command for in-TUI diff review"
                    ((INSTALLED_COUNT++))
                    ;;
                diff-review-web)
                    echo -e "  ${GREEN}✓${NC} diff-review-web/ - /diff-review-web browser-based diff review"
                    ((INSTALLED_COUNT++))
                    ;;
                *)
                    echo -e "  ${GREEN}✓${NC} $name"
                    ((INSTALLED_COUNT++))
                    ;;
            esac
        fi
    done
fi

echo ""
echo -e "${CYAN}╔════════════════════════════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║                  Extensions Setup Complete!                    ║${NC}"
echo -e "${CYAN}╚════════════════════════════════════════════════════════════════╝${NC}"
echo ""

if [[ "$DRY_RUN" == "true" ]]; then
    echo -e "${YELLOW}This was a dry run. No changes were made.${NC}"
    echo ""
fi

echo "Installed extensions:"
if [[ $INSTALLED_COUNT -gt 0 ]]; then
    echo "  • exit-command.ts - /exit command alias"
    echo "  • permission-gate.ts - Permission gate for dangerous commands"
    echo "  • permissions.json - Permission modes configuration"
    echo "  • share-local.ts - Export session to HTML and open in browser"
    echo "  • ask-questions.ts - Multi-question picker tool"
    echo "  • context-usage.ts - Context usage footer"
    echo "  • diff-review/ - /diff-review in-TUI diff review"
    echo "  • diff-review-web/ - /diff-review-web browser-based diff review"
else
    echo "  (none - all were already installed or not found)"
fi

echo ""
echo "Pi package:"
echo "  • npm:pi-web-access - Web search + fetch provider package"

echo ""
echo "Next steps:"
echo "  1. Restart pi or run:  /reload"
echo "  2. For full pi setup (settings, MCP), run: ./pi-setup/setup.sh"
echo ""
