#!/bin/bash
#
# pi-skills/setup.sh - Setup script for pi coding agent skills only
#
# This script sets up ONLY the skills for pi coding agent.
# For full pi setup (settings, MCP, etc.), use: ./pi-setup/setup.sh
#
# Skills are directory-based: each subdirectory of skills/ contains a
# SKILL.md (plus optional references/, agents/, scripts/ assets) and is
# copied verbatim into the pi skills directory.
#
# Usage:
#   ./setup.sh              # Interactive mode (prompts before overwriting)
#   ./setup.sh --dry-run    # Show what would be done
#   ./setup.sh --force      # Overwrite existing skills
#   ./setup.sh --help       # Show this help message

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Paths
PI_SKILLS_DIR="${PI_SKILLS_DIR:-$HOME/.agents/skills}"
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
            echo "  --force      Overwrite existing skills"
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
echo -e "${CYAN}║                Pi Skills Setup (Skills Only)                  ║${NC}"
echo -e "${CYAN}╚════════════════════════════════════════════════════════════════╝${NC}"
echo ""

# Function to install a single skill directory
install_skill() {
    local src="$1"
    local name=$(basename "$src")
    local dest="$PI_SKILLS_DIR/$name"

    if [[ ! -d "$src" ]]; then
        echo -e "  ${RED}✗${NC} Skill not found: $src"
        return 1
    fi

    # A valid skill directory must contain SKILL.md
    if [[ ! -f "$src/SKILL.md" ]]; then
        echo -e "  ${YELLOW}⚠ Skipping $name (no SKILL.md)${NC}"
        return 0
    fi

    if [[ -d "$dest" && "$FORCE" == "false" ]]; then
        echo -e "  ${YELLOW}↺${NC} $name (already installed, use --force to update)"
        return 0
    fi

    echo -e "  ${GREEN}→${NC} $name"
    if [[ "$DRY_RUN" == "false" ]]; then
        rm -rf "$dest"
        cp -R "$src" "$dest"
    fi
    return 0
}

echo -e "${BLUE}▸ Skills${NC}"
echo "  Source: $SETUP_DIR/skills/"
echo "  Target: $PI_SKILLS_DIR/"
echo ""

# Ensure target directory exists
if [[ ! -d "$PI_SKILLS_DIR" ]]; then
    echo -e "  Creating directory: $PI_SKILLS_DIR"
    if [[ "$DRY_RUN" == "false" ]]; then
        mkdir -p "$PI_SKILLS_DIR"
    fi
fi

if [[ -d "$SETUP_DIR/skills" && -n "$(ls -A "$SETUP_DIR/skills" 2>/dev/null)" ]]; then
    SKILL_COUNT=$(find "$SETUP_DIR/skills" -maxdepth 1 -mindepth 1 -type d | wc -l | tr -d ' ')
    echo "  Found $SKILL_COUNT skill(s) to install:"

    for item in "$SETUP_DIR/skills"/*/; do
        [[ -d "$item" ]] || continue
        install_skill "$item"
    done
else
    echo -e "  ${YELLOW}⚠ No skills found in $SETUP_DIR/skills/${NC}"
fi

echo ""

# Summary
INSTALLED_COUNT=0
SKIPPED_COUNT=0

if [[ "$DRY_RUN" == "false" ]]; then
    for item in "$PI_SKILLS_DIR"/*/; do
        [[ -d "$item" ]] || continue
        name=$(basename "$item")
        echo -e "  ${GREEN}✓${NC} $name"
        ((INSTALLED_COUNT++))
    done
fi

echo ""
echo -e "${CYAN}╔════════════════════════════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║                   Skills Setup Complete!                      ║${NC}"
echo -e "${CYAN}╚════════════════════════════════════════════════════════════════╝${NC}"
echo ""

if [[ "$DRY_RUN" == "true" ]]; then
    echo -e "${YELLOW}This was a dry run. No changes were made.${NC}"
    echo ""
fi

echo "Installed skills:"
if [[ $INSTALLED_COUNT -gt 0 ]]; then
    echo "  • agdr-decide, agdr-visualize - Agent Decision Record workflow"
    echo "  • architecture-context - ARCHITECTURE.md generation"
    echo "  • codebase-cleanup-audit - dead code / unused dep audits"
    echo "  • deep-module-reviewer - Ousterhout deep-module review"
    echo "  • frontend-skill - visually strong UI / landing pages"
    echo "  • grill-me - stress-test a plan or design"
    echo "  • handoff - compact conversation into a handoff doc"
    echo "  • humanizer - remove signs of AI-generated writing"
    echo "  • ponytail, ponytail-audit, ponytail-review - lazy/minimal solutions"
    echo "  • pr-rev-guide, pr-review-guide, pr-reviewer, pr-splitter, review-story - PR review suite"
    echo "  • review - correctness-focused code review"
    echo "  • security-best-practices - secure-by-default reviews"
    echo "  • simplify - review recent changes for reuse/quality"
    echo "  • unit-test-aaa - pytest Arrange-Act-Assert tests"
else
    echo "  (none - all were already installed or not found)"
fi

echo ""
echo "Next steps:"
echo "  1. Restart pi or run:  /reload"
echo "  2. For full pi setup (settings, MCP), run: ./pi-setup/setup.sh"
echo ""
