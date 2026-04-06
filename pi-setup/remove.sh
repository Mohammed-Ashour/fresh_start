#!/bin/bash
#
# remove.sh - Remove pi setup
#
# Usage:
#   ./remove.sh              # Interactive mode
#   ./remove.sh --dry-run    # Show what would be done
#   ./remove.sh --force      # Remove without confirmation

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

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
        *)
            echo "Unknown option: $1"
            exit 1
            ;;
    esac
done

echo -e "${RED}╔══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${RED}║                  Pi Remove Script                           ║${NC}"
echo -e "${RED}╚══════════════════════════════════════════════════════════════╝${NC}"
echo ""

# Function to remove files
remove_file() {
    local file="$1"
    local description="$2"
    
    if [[ ! -f "$file" && ! -L "$file" ]]; then
        echo -e "  ${YELLOW}⚠${NC} $description (not found: $file)"
        return
    fi
    
    echo -e "  ${RED}✗${NC} $description"
    if [[ "$DRY_RUN" == "false" ]]; then
        rm -f "$file"
    fi
}

# Confirmation prompt
if [[ "$FORCE" == "false" ]]; then
    echo -e "${YELLOW}This will remove the following from $PI_DIR:${NC}"
    echo ""
    
    for ext in "$SETUP_DIR/extensions"/*.ts; do
        if [[ -f "$ext" ]]; then
            local ext_name=$(basename "$ext")
            echo "    - extensions/$ext_name"
        fi
    done
    
    echo "    - settings.json"
    echo "    - mcp.json"
    echo ""
    
    read -p "Continue? [y/N] " -n 1 -r
    echo ""
    
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "Aborted."
        exit 0
    fi
fi

# Remove extensions
echo -e "${BLUE}▸ Extensions${NC}"
for ext in "$SETUP_DIR/extensions"/*.ts; do
    if [[ -f "$ext" ]]; then
        local ext_name=$(basename "$ext")
        remove_file "$PI_DIR/extensions/$ext_name" "Extension: $ext_name"
    fi
done
echo ""

# Remove config files
echo -e "${BLUE}▸ Configuration${NC}"
remove_file "$PI_DIR/settings.json" "settings.json"
remove_file "$PI_DIR/mcp.json" "mcp.json"
echo ""

echo -e "${GREEN}✓ Removal complete!${NC}"
echo ""

if [[ "$DRY_RUN" == "true" ]]; then
    echo -e "${YELLOW}This was a dry run. No changes were made.${NC}"
fi
