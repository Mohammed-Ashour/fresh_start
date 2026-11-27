#!/bin/bash
#
# pi-extensions/prune-sessions.sh - delete old pi session transcripts.
#
# Sessions keep every prompt, tool call, file read, and command output, so they
# can contain secrets. Pi has no retention setting; run this from time to time.
#
# Usage:
#   ./prune-sessions.sh              # show what would be deleted (older than 90 days)
#   ./prune-sessions.sh --days 30    # change the cutoff
#   ./prune-sessions.sh --apply      # delete

set -euo pipefail

PI_DIR="${PI_CODING_AGENT_DIR:-$HOME/.pi/agent}"
DAYS=90
APPLY=false

while [[ $# -gt 0 ]]; do
    case "$1" in
        --days) DAYS="${2:?--days needs a number}"; shift ;;
        --apply) APPLY=true ;;
        -h|--help) sed -n '3,12p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
        *) echo "Unknown option: $1" >&2; exit 1 ;;
    esac
    shift
done
[[ "$DAYS" =~ ^[0-9]+$ ]] || { echo "--days must be a whole number" >&2; exit 1; }

DIRS=()
for dir in "$PI_DIR/sessions" "$PI_DIR/exports"; do [[ -d "$dir" ]] && DIRS+=("$dir"); done
if [[ ${#DIRS[@]} -eq 0 ]]; then echo "No session folders under $PI_DIR"; exit 0; fi

FILES=()
while IFS= read -r -d '' file; do FILES+=("$file"); done < <(find "${DIRS[@]}" -type f -mtime "+$DAYS" -print0)

if [[ ${#FILES[@]} -eq 0 ]]; then
    echo "Nothing older than $DAYS days."
    exit 0
fi

size="$(du -ch "${FILES[@]}" | tail -n 1 | cut -f1)"
if [[ "$APPLY" == false ]]; then
    echo "Would delete ${#FILES[@]} files older than $DAYS days ($size). Rerun with --apply to delete."
    exit 0
fi

rm -f -- "${FILES[@]}"
find "${DIRS[@]}" -mindepth 1 -type d -empty -delete
echo "Deleted ${#FILES[@]} files older than $DAYS days ($size)."
