#!/bin/bash
#
# pi-extensions/setup.sh - install pi coding agent extensions from this repo.
#
# Copies each item in extensions/ (a .ts/.json file or an extension directory)
# into the pi extensions directory, then installs the npm:pi-web-access package.
#
# Usage:
#   ./setup.sh                    # choose extensions interactively
#   ./setup.sh --all              # install all extensions
#   ./setup.sh mini-agents        # install only the named extensions
#   ./setup.sh --list             # show available extensions and their status
#   ./setup.sh --dry-run          # show what would change
#   ./setup.sh --force            # overwrite selected installed copies

set -euo pipefail

PI_DIR="${PI_CODING_AGENT_DIR:-$HOME/.pi/agent}"
TARGET="$PI_DIR/extensions"
SETUP_DIR="$(cd "$(dirname "$0")" && pwd)"
SOURCE="$SETUP_DIR/extensions"
PACKAGE="npm:pi-web-access"
STATE_FILE="$TARGET/.fresh-start-state"
source "$SETUP_DIR/../lib/installer-ui.sh"

if [[ -t 1 ]]; then
    GREEN=$'\033[0;32m'; YELLOW=$'\033[1;33m'; RED=$'\033[0;31m'; DIM=$'\033[2m'; BOLD=$'\033[1m'; NC=$'\033[0m'
else
    GREEN=""; YELLOW=""; RED=""; DIM=""; BOLD=""; NC=""
fi

DRY_RUN=false
FORCE=false
LIST=false
ALL=false
PICKED_INTERACTIVELY=false
SELECTED=()

usage() {
    cat <<EOF
Usage: $(basename "$0") [options] [name ...]

Install pi extensions into $TARGET.
With no arguments, opens an interactive picker. Automation must use --all or names.

Options:
  --all        Install every extension plus $PACKAGE
  --list       List available extensions and their install status
  --dry-run    Show what would change without changing anything
  --force      Overwrite selected installed extensions, including current copies
  -h, --help   Show this help

Examples:
  $(basename "$0")                       # choose extensions interactively
  $(basename "$0") --all                 # install everything
  $(basename "$0") mini-agents           # also installs pi-web-access
  $(basename "$0") --all --dry-run
EOF
}

describe() {
    awk -F '\t' -v name="$1" '$1 == name { print $2; exit }' "$SETUP_DIR/manifest.tsv"
}

hash_stream() {
    if command -v shasum >/dev/null 2>&1; then shasum -a 256 | awk '{print $1}'
    else sha256sum | awk '{print $1}'
    fi
}

# Hash file contents, relative paths, symlink targets, and executable bits.
hash_item() {
    local path="$1"
    if [[ -L "$path" ]]; then
        printf 'link:%s\n' "$(readlink "$path")" | hash_stream
    elif [[ -f "$path" ]]; then
        hash_stream < "$path"
    else
        (
            cd "$path"
            find . \( -type f -o -type l \) -print | LC_ALL=C sort | while IFS= read -r entry; do
                if [[ -L "$entry" ]]; then
                    printf '%s\tlink:%s\n' "$entry" "$(readlink "$entry")"
                else
                    [[ -x "$entry" ]] && executable=x || executable=-
                    printf '%s\t%s\t' "$entry" "$executable"
                    hash_stream < "$entry"
                fi
            done
        ) | hash_stream
    fi
}

saved_hash() {
    local name="$1"
    [[ -f "$STATE_FILE" ]] || return 0
    awk -F '\t' -v name="$name" '$1 == name { print $2; exit }' "$STATE_FILE"
}

record_hash() {
    local name="$1" temporary="$STATE_FILE.$$.tmp"
    mkdir -p "$TARGET"
    if [[ -f "$STATE_FILE" ]]; then
        awk -F '\t' -v name="$name" '$1 != name' "$STATE_FILE" > "$temporary"
    else
        : > "$temporary"
    fi
    printf '%s\t%s\n' "$name" "$(hash_item "$SOURCE/$name")" >> "$temporary"
    mv "$temporary" "$STATE_FILE"
}

# Distinguish safe repository updates from edits made to the installed copy.
state_of() {
    local name="$1" source_hash target_hash previous_hash
    if [[ ! -e "$TARGET/$name" && ! -L "$TARGET/$name" ]]; then echo new; return; fi
    source_hash="$(hash_item "$SOURCE/$name")"
    target_hash="$(hash_item "$TARGET/$name")"
    if [[ "$source_hash" == "$target_hash" ]]; then echo current; return; fi
    previous_hash="$(saved_hash "$name")"
    if [[ -n "$previous_hash" && "$target_hash" == "$previous_hash" ]]; then echo update
    else echo changed
    fi
}

row() {
    printf "  %s %-20s %s%-28s%s %s%s%s\n" "$1" "$2" "$3" "$4" "$NC" "$DIM" "$5" "$NC"
}

while [[ $# -gt 0 ]]; do
    case "$1" in
        --all) ALL=true ;;
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
            update) row "${GREEN}↑${NC}" "$name" "$GREEN" "update available" "$(describe "$name")" ;;
            changed) row "${YELLOW}!${NC}" "$name" "$YELLOW" "installed, locally modified" "$(describe "$name")" ;;
        esac
    done
    exit 0
fi

if [[ "$ALL" == true && ${#SELECTED[@]} -gt 0 ]]; then
    echo "${RED}Use --all or named extensions, not both.${NC}" >&2
    exit 1
fi

if [[ "$ALL" == false && ${#SELECTED[@]} -eq 0 ]]; then
    if [[ ! -t 0 || ! -t 1 ]]; then
        echo "${RED}No extensions selected.${NC} Use --all or pass extension names when running non-interactively." >&2
        exit 2
    fi
    PICKER_TITLE="Pi extensions"
    PICKER_VALUES=("${AVAILABLE[@]}")
    PICKER_LABELS=("${AVAILABLE[@]}")
    PICKER_DETAILS=()
    for name in "${AVAILABLE[@]}"; do
        state="$(state_of "$name")"
        case "$state" in
            new) status="not installed" ;;
            current) status="up to date" ;;
            update) status="update available" ;;
            changed) status="local changes" ;;
        esac
        PICKER_DETAILS+=("$status · $(describe "$name")")
    done
    ui_pick || exit 2
    SELECTED=("${PICKER_SELECTED[@]}")
    PICKED_INTERACTIVELY=true
fi

INSTALL_PACKAGE=false
if [[ "$ALL" == true ]]; then
    TODO=("${AVAILABLE[@]}")
    INSTALL_PACKAGE=true
else
    for name in "${SELECTED[@]}"; do
        found=false
        for candidate in "${AVAILABLE[@]}"; do [[ "$candidate" == "$name" ]] && found=true; done
        if [[ "$found" == false ]]; then
            echo "${RED}Unknown extension: $name${NC}" >&2
            echo "Available: ${AVAILABLE[*]}" >&2
            exit 1
        fi
        [[ "$name" == mini-agents ]] && INSTALL_PACKAGE=true
    done
    TODO=("${SELECTED[@]}")
fi

if [[ "$PICKED_INTERACTIVELY" == true && "$FORCE" == false ]]; then
    has_installed=false
    for name in "${TODO[@]}"; do
        [[ "$(state_of "$name")" != new ]] && has_installed=true && break
    done
    if [[ "$has_installed" == true ]]; then
        ui_confirm "Overwrite installed copies in this selection?" N && FORCE=true
    fi
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

installed=0; updated=0; overwritten=0; current=0; kept=0
for name in "${TODO[@]}"; do
    state="$(state_of "$name")"
    if [[ "$state" == current && "$FORCE" == false ]]; then
        row "${GREEN}✓${NC}" "$name" "$DIM" "up to date" "$(describe "$name")"
        [[ "$DRY_RUN" == false ]] && record_hash "$name"
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
        record_hash "$name"
    fi
    if [[ "$state" == new ]]; then
        row "${GREEN}+${NC}" "$name" "$GREEN" "$([[ "$DRY_RUN" == true ]] && echo "would install" || echo installed)" "$(describe "$name")"
        installed=$((installed + 1))
    elif [[ "$state" == update ]]; then
        row "${GREEN}↑${NC}" "$name" "$GREEN" "$([[ "$DRY_RUN" == true ]] && echo "would update" || echo updated)" "$(describe "$name")"
        updated=$((updated + 1))
    else
        row "${GREEN}↻${NC}" "$name" "$GREEN" "$([[ "$DRY_RUN" == true ]] && echo "would overwrite" || echo overwritten)" "$(describe "$name")"
        overwritten=$((overwritten + 1))
    fi
done

echo
if [[ "$INSTALL_PACKAGE" == true ]]; then
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
    summary="$installed to install, $updated to update, $overwritten to overwrite, $current up to date"
else
    summary="$installed installed, $updated updated, $overwritten overwritten, $current up to date"
fi
[[ $kept -gt 0 ]] && summary="$summary, ${YELLOW}$kept kept with local changes${NC} (rerun with --force to replace)"
if [[ "$DRY_RUN" == true ]]; then
    echo "${BOLD}Dry run:${NC} $summary."
else
    echo "${BOLD}Done:${NC} $summary."
    [[ $((installed + updated + overwritten)) -gt 0 ]] && echo "Next: run /reload in pi, or restart it."
fi
exit 0
