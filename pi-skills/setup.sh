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
STATE_FILE="$TARGET/.fresh-start-state"

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
    printf "  %s %-24s %s%-24s%s %s%s%s\n" "$1" "$2" "$3" "$4" "$NC" "$DIM" "$5" "$NC"
}

contains() {
    local wanted="$1" item
    shift
    for item in "$@"; do [[ "$item" == "$wanted" ]] && return 0; done
    return 1
}

skill_dependencies() {
    case "$1" in
        skipper-review) echo "science-pr-review show-me unslop" ;;
        skipper-review-deep) echo "skipper-review" ;;
        science-pr-review) echo "skipper-review" ;;
    esac
}

add_with_dependencies() {
    local name="$1" dependency
    contains "$name" "${TODO[@]:-}" && return
    TODO+=("$name")
    for dependency in $(skill_dependencies "$name"); do
        contains "$dependency" "${AVAILABLE[@]}" || {
            echo "${RED}Missing dependency for $name: $dependency${NC}" >&2
            exit 1
        }
        add_with_dependencies "$dependency"
    done
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
            update) row "${GREEN}↑${NC}" "$name" "$GREEN" "update available" "$(describe "$name")" ;;
            changed) row "${YELLOW}!${NC}" "$name" "$YELLOW" "installed, locally modified" "$(describe "$name")" ;;
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
    TODO=()
    for name in "${SELECTED[@]}"; do add_with_dependencies "$name"; done
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
