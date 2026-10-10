#!/bin/bash

# Shared zero-dependency terminal picker for the setup scripts.

if [[ -t 1 ]]; then
    UI_BOLD=$'\033[1m'
    UI_DIM=$'\033[2m'
    UI_GREEN=$'\033[0;32m'
    UI_RED=$'\033[0;31m'
    UI_RESET=$'\033[0m'
else
    UI_BOLD=""
    UI_DIM=""
    UI_GREEN=""
    UI_RED=""
    UI_RESET=""
fi

ui_confirm() {
    local prompt="$1" default="${2:-Y}" answer
    if [[ "$default" == Y ]]; then
        printf "%s [Y/n] " "$prompt"
    else
        printf "%s [y/N] " "$prompt"
    fi
    read -r answer || return 1
    case "$answer" in
        y|Y|yes|YES) return 0 ;;
        "") [[ "$default" == Y ]] ;;
        *) return 1 ;;
    esac
}

# Expects PICKER_TITLE, PICKER_VALUES, PICKER_LABELS, and PICKER_DETAILS arrays.
# Returns the chosen values in PICKER_SELECTED. A cancelled picker returns 1.
ui_pick() {
    local count index input token number selected_count width height detail_width detail page page_size page_count start end error=""
    local marks=()
    PICKER_SELECTED=()
    count=${#PICKER_VALUES[@]}
    width=${COLUMNS:-100}
    height=${LINES:-24}
    [[ "$width" =~ ^[0-9]+$ ]] || width=100
    [[ "$height" =~ ^[0-9]+$ ]] || height=24
    detail_width=$((width - 36))
    [[ $detail_width -lt 16 ]] && detail_width=16
    page_size=$((height - 9))
    [[ $page_size -lt 5 ]] && page_size=5
    page_count=$(((count + page_size - 1) / page_size))
    page=0
    for ((index = 0; index < count; index++)); do marks[index]=false; done

    while true; do
        printf '\033[2J\033[H'
        printf '%s%s%s' "$UI_BOLD" "$PICKER_TITLE" "$UI_RESET"
        [[ $page_count -gt 1 ]] && printf ' %s(page %d/%d)%s' "$UI_DIM" "$((page + 1))" "$page_count" "$UI_RESET"
        printf '\n%sToggle one or more items, then press Enter.%s\n\n' "$UI_DIM" "$UI_RESET"

        start=$((page * page_size))
        end=$((start + page_size))
        [[ $end -gt $count ]] && end=$count
        for ((index = start; index < end; index++)); do
            detail="${PICKER_DETAILS[index]}"
            [[ ${#detail} -gt $detail_width ]] && detail="${detail:0:$((detail_width - 3))}..."
            if [[ "${marks[index]}" == true ]]; then
                printf '  %s[x]%s %2d  %-24s %s\n' "$UI_GREEN" "$UI_RESET" "$((index + 1))" "${PICKER_LABELS[index]}" "$detail"
            else
                printf '  [ ] %2d  %-24s %s\n' "$((index + 1))" "${PICKER_LABELS[index]}" "$detail"
            fi
        done

        selected_count=0
        for ((index = 0; index < count; index++)); do [[ "${marks[index]}" == true ]] && selected_count=$((selected_count + 1)); done
        printf '\n%sSelected: %d · Numbers toggle · a all · n none' "$UI_DIM" "$selected_count"
        [[ $page_count -gt 1 ]] && printf ' · < > page'
        printf ' · Enter continue · q quit%s\n' "$UI_RESET"
        [[ -n "$error" ]] && printf '%s%s%s\n' "$UI_RED" "$error" "$UI_RESET"
        printf '> '
        read -r input || return 1
        error=""
        input="${input//,/ }"

        case "$input" in
            q|Q) return 1 ;;
            a|A|all)
                for ((index = 0; index < count; index++)); do marks[index]=true; done
                continue
                ;;
            n|N|none)
                for ((index = 0; index < count; index++)); do marks[index]=false; done
                continue
                ;;
            '>'|next)
                [[ $page -lt $((page_count - 1)) ]] && page=$((page + 1))
                continue
                ;;
            '<'|prev)
                [[ $page -gt 0 ]] && page=$((page - 1))
                continue
                ;;
            "")
                PICKER_SELECTED=()
                for ((index = 0; index < count; index++)); do
                    [[ "${marks[index]}" == true ]] && PICKER_SELECTED+=("${PICKER_VALUES[index]}")
                done
                selected_count=${#PICKER_SELECTED[@]}
                if [[ $selected_count -eq 0 ]]; then
                    error="Select at least one item."
                    continue
                fi

                printf '\033[2J\033[H%sPlan%s\n\n' "$UI_BOLD" "$UI_RESET"
                for ((index = 0; index < count; index++)); do
                    [[ "${marks[index]}" == true ]] && printf '  • %s\n' "${PICKER_LABELS[index]}"
                done
                printf '\n'
                ui_confirm "Continue with $selected_count item(s)?" && return 0
                ;;
            *)
                for token in $input; do
                    if [[ "$token" =~ ^[0-9]+$ ]]; then
                        number=$((10#$token))
                    else
                        number=0
                    fi
                    if [[ $number -ge 1 && $number -le $count ]]; then
                        index=$((number - 1))
                        if [[ "${marks[index]}" == true ]]; then marks[index]=false; else marks[index]=true; fi
                    else
                        error="Unknown selection: $token"
                        break
                    fi
                done
                ;;
        esac
    done
}
