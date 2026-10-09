#!/bin/bash
#
# pi-extensions/setup.sh - install pi coding agent extensions from this repo.
#
# Copies each item in extensions/ (a .ts/.json file or an extension directory)
# into the pi extensions directory, then installs the npm:pi-web-access package.
#
# Usage:
#   ./setup.sh                    # install all extensions
#   ./setup.sh mini-agents        # install only the named extensions
#   ./setup.sh --list             # show available extensions and their status
#   ./setup.sh --dry-run          # show what would change
#   ./setup.sh --force            # also replace installed copies with local changes

set -euo pipefail

PI_DIR="${PI_CODING_AGENT_DIR:-$HOME/.pi/agent}"
TARGET="$PI_DIR/extensions"
SOURCE="$(cd "$(dirname "$0")" && pwd)/extensions"
PACKAGE="npm:pi-web-access"

if [[ -t 1 ]]; then
    GREEN=$'\033[0;32m'; YELLOW=$'\033[1;33m'; RED=$'\033[0;31m'; DIM=$'\033[2m'; BOLD=$'\033[1m'; NC=$'\033[0m'
else
    GREEN=""; YELLOW=""; RED=""; DIM=""; BOLD=""; NC=""
fi

DRY_RUN=false
FORCE=false
LIST=false
SELECTED=()

usage() {
    cat <<EOF
Usage: $(basename "$0") [options] [name ...]

Install pi extensions into $TARGET.
With no names, installs every extension plus $PACKAGE.

Options:
  --list       List available extensions and their install status
  --dry-run    Show what would change without changing anything
  --force      Replace installed extensions that have local changes
  -h, --help   Show this help

Examples:
  $(basename "$0")                       # install everything
  $(basename "$0") mini-agents diff-review
  $(basename "$0") --dry-run --force
EOF
}

describe() {
    case "$1" in
        ask-questions.ts) echo "Multi-question picker tool" ;;
        context-usage.ts) echo "Context usage in the footer" ;;
        diff-review) echo "/diff-review: review a git diff in the TUI" ;;
        diff-review-web) echo "/diff-review-web: review a git diff in the browser" ;;
        exit-command.ts) echo "/exit as an alias for /quit" ;;
        mini-agents) echo "/reviewers and /researchers background subagents" ;;
        permission-gate.ts) echo "Blocks dangerous commands (modes in permissions.json)" ;;
        permissions.json) echo "Permission modes for permission-gate (default: safeMode)" ;;
        share-local.ts) echo "/share-local: export the session to HTML" ;;
        *) echo "" ;;
    esac
}

# Print the install state of one item: new, current (identical), or changed.
state_of() {
    local name="$1"
    if [[ ! -e "$TARGET/$name" ]]; then echo new
    elif diff -rq "$SOURCE/$name" "$TARGET/$name" >/dev/null 2>&1; then echo current
    else echo changed
    fi
}

row() {
    printf "  %s %-20s %s%-28s%s %s%s%s\n" "$1" "$2" "$3" "$4" "$NC" "$DIM" "$5" "$NC"
}

while [[ $# -gt 0 ]]; do
    case "$1" in
        --dry-run) DRY_RUN=true ;;
        --force) FORCE=true ;;
        --list) LIST=true ;;
        -h|--help) usage; exit 0 ;;
        -*) echo "${RED}Unknown option: $1${NC}" >&2; echo >&2; usage >&2; exit 1 ;;
        *) SELECTED+=("$1") ;;
    esac
    shift
done

AVAILABLE=()
for item in "$SOURCE"/*; do
    [[ -e "$item" ]] || continue
    name="$(basename "$item")"
    [[ "$name" == *.disabled ]] && continue
    AVAILABLE+=("$name")
done

if [[ ${#AVAILABLE[@]} -eq 0 ]]; then
    echo "${RED}No extensions found in $SOURCE${NC}" >&2
    exit 1
fi

if [[ "$LIST" == true ]]; then
    echo "${BOLD}Available extensions${NC} ${DIM}(target: $TARGET)${NC}"
    echo
    for name in "${AVAILABLE[@]}"; do
        case "$(state_of "$name")" in
            new) row "${DIM}○${NC}" "$name" "$DIM" "not installed" "$(describe "$name")" ;;
            current) row "${GREEN}✓${NC}" "$name" "$GREEN" "installed, up to date" "$(describe "$name")" ;;
            changed) row "${YELLOW}!${NC}" "$name" "$YELLOW" "installed, differs" "$(describe "$name")" ;;
        esac
    done
    exit 0
fi

if [[ ${#SELECTED[@]} -gt 0 ]]; then
    for name in "${SELECTED[@]}"; do
        found=false
        for candidate in "${AVAILABLE[@]}"; do [[ "$candidate" == "$name" ]] && found=true; done
        if [[ "$found" == false ]]; then
            echo "${RED}Unknown extension: $name${NC}" >&2
            echo "Available: ${AVAILABLE[*]}" >&2
            exit 1
        fi
    done
    TODO=("${SELECTED[@]}")
else
    TODO=("${AVAILABLE[@]}")
fi

if [[ ! -d "$PI_DIR" ]]; then
    echo "${YELLOW}Pi agent directory not found: $PI_DIR${NC}" >&2
    echo "Install pi first (https://pi.dev), then rerun this script." >&2
    exit 1
fi

if [[ "$DRY_RUN" == true ]]; then
    echo "${BOLD}Pi extensions${NC} → $TARGET ${YELLOW}(dry run: nothing will change)${NC}"
else
    echo "${BOLD}Pi extensions${NC} → $TARGET"
fi
echo
[[ "$DRY_RUN" == false ]] && mkdir -p "$TARGET"

installed=0; updated=0; current=0; kept=0
for name in "${TODO[@]}"; do
    state="$(state_of "$name")"
    if [[ "$state" == current ]]; then
        row "${GREEN}✓${NC}" "$name" "$DIM" "up to date" "$(describe "$name")"
        current=$((current + 1))
        continue
    fi
    if [[ "$state" == changed && "$FORCE" == false ]]; then
        row "${YELLOW}!${NC}" "$name" "$YELLOW" "local changes, kept" "use --force to replace"
        kept=$((kept + 1))
        continue
    fi
    if [[ "$DRY_RUN" == false ]]; then
        rm -rf "${TARGET:?}/$name"
        cp -R "$SOURCE/$name" "$TARGET/$name"
    fi
    if [[ "$state" == new ]]; then
        row "${GREEN}+${NC}" "$name" "$GREEN" "$([[ "$DRY_RUN" == true ]] && echo "would install" || echo installed)" "$(describe "$name")"
        installed=$((installed + 1))
    else
        row "${GREEN}↑${NC}" "$name" "$GREEN" "$([[ "$DRY_RUN" == true ]] && echo "would update" || echo updated)" "$(describe "$name")"
        updated=$((updated + 1))
    fi
done

echo
if [[ ${#SELECTED[@]} -eq 0 ]]; then
    echo "${BOLD}Pi package${NC}"
    if ! command -v pi >/dev/null 2>&1; then
        row "${YELLOW}!${NC}" "$PACKAGE" "$YELLOW" "skipped: pi not on PATH" "web search for pi and mini-agents"
    elif [[ "$DRY_RUN" == true ]]; then
        row "${GREEN}+${NC}" "$PACKAGE" "$GREEN" "would run pi install" "web search for pi and mini-agents"
    elif pi install "$PACKAGE" >/dev/null 2>&1; then
        row "${GREEN}✓${NC}" "$PACKAGE" "$GREEN" "installed" "web search for pi and mini-agents"
    else
        row "${RED}✗${NC}" "$PACKAGE" "$RED" "pi install failed" "retry: pi install $PACKAGE"
    fi
    echo
fi

for name in "${TODO[@]}"; do
    [[ "$name" == mini-agents ]] || continue
    if ! command -v gh >/dev/null 2>&1; then
        echo "${YELLOW}!${NC} mini-agents PR reviews need the GitHub CLI: brew install gh && gh auth login"
        echo
    elif ! gh auth status >/dev/null 2>&1; then
        echo "${YELLOW}!${NC} mini-agents PR reviews need GitHub access: gh auth login"
        echo
    fi
done

if [[ "$DRY_RUN" == true ]]; then
    summary="$installed to install, $updated to update, $current up to date"
else
    summary="$installed installed, $updated updated, $current up to date"
fi
[[ $kept -gt 0 ]] && summary="$summary, ${YELLOW}$kept kept with local changes${NC} (rerun with --force to replace)"
if [[ "$DRY_RUN" == true ]]; then
    echo "${BOLD}Dry run:${NC} $summary."
else
    echo "${BOLD}Done:${NC} $summary."
    [[ $((installed + updated)) -gt 0 ]] && echo "Next: run /reload in pi, or restart it."
fi
exit 0
