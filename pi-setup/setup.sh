#!/bin/bash
#
# pi-setup.sh - Setup script for pi coding agent
# 
# This script sets up your personalized pi configuration including:
# - Extensions (web-search, permission gates, etc.)
# - Settings (default model, thinking level, packages)
# - MCP server configuration
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

echo -e "${BLUE}╔══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║                  Pi Setup Script                           ║${NC}"
echo -e "${BLUE}╚══════════════════════════════════════════════════════════════╝${NC}"
echo ""

# Function to copy files
copy_file() {
    local src="$1"
    local dest="$2"
    local description="$3"
    
    if [[ ! -f "$src" ]]; then
        echo -e "${YELLOW}⚠ Skipping $description (source not found: $src)${NC}"
        return
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
        return
    fi
    
    echo -e "  ${GREEN}✓${NC} $description"
    if [[ "$DRY_RUN" == "false" ]]; then
        cp "$src" "$dest"
    fi
}

# Function to link files
link_file() {
    local src="$1"
    local dest="$2"
    local description="$3"
    
    if [[ ! -f "$src" ]]; then
        echo -e "${YELLOW}⚠ Skipping $description (source not found: $src)${NC}"
        return
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
        return
    fi
    
    echo -e "  ${GREEN}✓${NC} $description (symlink)"
    if [[ "$DRY_RUN" == "false" ]]; then
        ln -sf "$src" "$dest"
    fi
}

# Function to merge JSON
merge_json() {
    local src="$1"
    local dest="$2"
    local key="$3"
    
    if [[ ! -f "$src" ]]; then
        return
    fi
    
    # For JSON files, we use a simple approach: just copy if doesn't exist
    # For more complex merging, consider using jq
    if [[ -f "$dest" && "$FORCE" == "false" ]]; then
        echo -e "${YELLOW}⚠ Skipping $key config (already exists: $dest)${NC}"
        return
    fi
    
    echo -e "  ${GREEN}✓${NC} $key configuration"
    if [[ "$DRY_RUN" == "false" ]]; then
        cp "$src" "$dest"
    fi
}

# Step 1: Extensions
echo -e "${BLUE}▸ Extensions${NC}"
echo "  Source: $SETUP_DIR/extensions/"
if [[ -d "$SETUP_DIR/extensions" && -n "$(ls -A "$SETUP_DIR/extensions" 2>/dev/null)" ]]; then
    for item in "$SETUP_DIR/extensions"/*; do
        if [[ -f "$item" ]]; then
            item_name=$(basename "$item")
            copy_file "$item" "$PI_DIR/extensions/$item_name" "Extension: $item_name"
        fi
    done
else
    echo -e "  ${YELLOW}⚠ No extensions found in $SETUP_DIR/extensions/${NC}"
fi
echo ""

# Step 2: Settings
echo -e "${BLUE}▸ Settings${NC}"
echo "  Source: $SETUP_DIR/config/"
if [[ -f "$SETUP_DIR/config/settings.json" ]]; then
    merge_json "$SETUP_DIR/config/settings.json" "$PI_DIR/settings.json" "Settings"
    echo ""
    echo "  Current settings:"
    echo "    - Default Provider: opencode-go"
    echo "    - Default Model: minimax-m2.7"
    echo "    - Thinking Level: medium"
    echo "    - Packages:"
    echo "      • @rhedbull/pi-permissions"
    echo "      • pi-mcp-adapter"
else
    echo -e "  ${YELLOW}⚠ No settings.json found${NC}"
fi
echo ""

# Step 3: MCP Configuration
echo -e "${BLUE}▸ MCP Servers${NC}"
echo "  Source: $SETUP_DIR/config/"
if [[ -f "$SETUP_DIR/config/mcp.json" ]]; then
    merge_json "$SETUP_DIR/config/mcp.json" "$PI_DIR/mcp.json" "MCP configuration"
    echo ""
    echo "  Current MCP servers:"
    echo "    • lod-mcp (Luxembourgish Dictionary)"
else
    echo -e "  ${YELLOW}⚠ No mcp.json found${NC}"
fi
echo ""

# Step 4: Create directories if needed
echo -e "${BLUE}▸ Directories${NC}"
for dir in extensions themes skills prompts; do
    if [[ ! -d "$PI_DIR/$dir" ]]; then
        echo -e "  ${GREEN}✓${NC} Creating directory: $PI_DIR/$dir"
        if [[ "$DRY_RUN" == "false" ]]; then
            mkdir -p "$PI_DIR/$dir"
        fi
    else
        echo -e "  ${YELLOW}⚠${NC} Directory exists: $PI_DIR/$dir"
    fi
done
echo ""

# Summary
echo -e "${BLUE}╔══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║                    Setup Complete!                             ║${NC}"
echo -e "${BLUE}╚══════════════════════════════════════════════════════════════╝${NC}"
echo ""

if [[ "$DRY_RUN" == "true" ]]; then
    echo -e "${YELLOW}This was a dry run. No changes were made.${NC}"
    echo ""
fi

echo "Next steps:"
echo "  1. Restart pi or run:  /reload"
echo "  2. Install npm packages:"
echo "       npm install -g @rhedbull/pi-permissions pi-mcp-adapter"
echo "  3. Configure MCP server path in mcp.json if needed"
echo ""
