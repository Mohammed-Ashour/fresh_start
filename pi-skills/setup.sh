#!/bin/bash
#
# pi-skills/setup.sh - install agent skills from this repo.
#
# Each directory in skills/ holds a SKILL.md (plus optional references/,
# agents/, scripts/) and is copied as-is into the skills directory.
#
# Usage:
#   ./setup.sh                    # install all skills
#   ./setup.sh humanizer grill-me # install only the named skills
#   ./setup.sh --list             # show available skills and their status
#   ./setup.sh --dry-run          # show what would change
#   ./setup.sh --force            # also replace installed copies with local changes

set -euo pipefail

TARGET="${PI_SKILLS_DIR:-$HOME/.agents/skills}"
SOURCE="$(cd "$(dirname "$0")" && pwd)/skills"

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

Install agent skills into $TARGET.
With no names, installs every skill.

Options:
  --list       List available skills and their install status
  --dry-run    Show what would change without changing anything
  --force      Replace installed skills that have local changes
  -h, --help   Show this help

Examples:
  $(basename "$0")                       # install everything
  $(basename "$0") humanizer grill-me
  $(basename "$0") --dry-run --force
EOF
}

# First sentence of the SKILL.md frontmatter description, cut to one line.
describe() {
    local text
    text="$(awk '
        NR == 1 && $0 != "---" { exit }
        NR > 1 && $0 == "---" { exit }
        want { sub(/^[ \t]+/, ""); print; exit }
        /^description:/ {
            sub(/^description:[ \t]*/, "")
            if ($0 == "" || $0 ~ /^[>|][-+]?$/) { want = 1; next }
            print; exit
        }' "$SOURCE/$1/SKILL.md")"
    text="${text#\"}"; text="${text%\"}"
    text="${text%%. *}"; text="${text%.}"
    [[ ${#text} -gt 60 ]] && text="${text:0:59}…"
    echo "$text"
}

# Print the install state of one skill: new, current (identical), or changed.
state_of() {
    local name="$1"
    if [[ ! -e "$TARGET/$name" ]]; then echo new
    elif diff -rq "$SOURCE/$name" "$TARGET/$name" >/dev/null 2>&1; then echo current
    else echo changed
    fi
}

row() {
    printf "  %s %-24s %s%-24s%s %s%s%s\n" "$1" "$2" "$3" "$4" "$NC" "$DIM" "$5" "$NC"
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
for item in "$SOURCE"/*/; do
    [[ -f "$item/SKILL.md" ]] || continue
    AVAILABLE+=("$(basename "$item")")
done

if [[ ${#AVAILABLE[@]} -eq 0 ]]; then
    echo "${RED}No skills found in $SOURCE${NC}" >&2
    exit 1
fi

if [[ "$LIST" == true ]]; then
    echo "${BOLD}Available skills${NC} ${DIM}(target: $TARGET)${NC}"
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
            echo "${RED}Unknown skill: $name${NC}" >&2
            echo "Available: ${AVAILABLE[*]}" >&2
            exit 1
        fi
    done
    TODO=("${SELECTED[@]}")
else
    TODO=("${AVAILABLE[@]}")
fi

if [[ "$DRY_RUN" == true ]]; then
    echo "${BOLD}Agent skills${NC} → $TARGET ${YELLOW}(dry run: nothing will change)${NC}"
else
    echo "${BOLD}Agent skills${NC} → $TARGET"
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
