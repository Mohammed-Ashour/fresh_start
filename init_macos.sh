#!/bin/bash

# ═══════════════════════════════════════════════════════════════════════════
#                          Fresh macOS Setup
# ═══════════════════════════════════════════════════════════════════════════
#
# Interactive macOS development environment setup with modular components.
#
# Usage:
#   ./init_macos.sh                    # Interactive multi-select + prompts
#   ./init_macos.sh --all              # Install everything
#   ./init_macos.sh --category <name>  # Install specific category
#   ./init_macos.sh --dry-run          # Show what would be done
#   ./init_macos.sh --force --all      # Overwrite installed Pi items
#
# Categories:
#   core, dev-tools, zed, productivity, kubernetes, cli-tools, pi-extensions, pi-skills
#
# ═══════════════════════════════════════════════════════════════════════════

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/lib/installer-ui.sh"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
MAGENTA='\033[0;35m'
NC='\033[0m' # No Color

# Arrays to store installation status
INSTALLED_PACKAGES=()
ALREADY_SETUP_PACKAGES=()
SKIPPED_PACKAGES=()

# Options
DRY_RUN=false
FORCE=false
CATEGORY=""
INSTALL_ALL=false

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --dry-run)
            DRY_RUN=true
            shift
            ;;
        --all)
            INSTALL_ALL=true
            shift
            ;;
        --force)
            FORCE=true
            shift
            ;;
        --category)
            if [[ $# -lt 2 ]]; then
                echo "--category requires a name" >&2
                exit 1
            fi
            CATEGORY="$2"
            shift 2
            ;;
        --help|-h)
            echo "Usage: $0 [options]"
            echo ""
            echo "Options:"
            echo "  --dry-run            Show what would be done without making changes"
            echo "  --all                Install every category without opening the picker"
            echo "  --category <name>    Install specific category"
            echo "  --force              Overwrite selected installed Pi skills and extensions"
            echo "  --help               Show this help message"
            echo ""
            echo "Categories:"
            echo "  core           - Homebrew, Zsh, Oh My Zsh, Git"
            echo "  dev-tools      - VS Code, lazygit, fzf, tmux"
            echo "  zed            - Zed editor + settings"
            echo "  productivity   - Ghostty, Rectangle, Obsidian, Zen, Bitwarden"
            echo "  kubernetes     - Docker, kubectl, Helm, Minikube, K9s"
            echo "  cli-tools      - bat, eza, ripgrep, zellij, lazydocker"
            echo "  pi-extensions  - Pi extensions + pi web access"
            echo "  pi-skills      - Pi agent skills (review, ponytail, agdr, ...)"
            exit 0
            ;;
        *)
            echo "Unknown option: $1"
            exit 1
            ;;
    esac
done

INTERACTIVE_MODE=false
if [[ -z "$CATEGORY" && "$INSTALL_ALL" == "false" && -t 0 && -t 1 ]]; then
    INTERACTIVE_MODE=true
fi

# Function to detect the macOS architecture
get_macos_arch() {
    if /usr/bin/arch | grep -q "arm64"; then
        echo "arm64"
    else
        echo "intel"
    fi
}

# Function to check if package is installed
is_installed() {
    local cmd="$1"
    command -v "$cmd" &> /dev/null
}

# Function to check if cask is installed
is_cask_installed() {
    local name="$1"
    command -v brew &>/dev/null || return 1
    brew list --cask "$name" &>/dev/null
}

# Function to add to installed list
mark_installed() {
    local package="$1"
    if [[ ! " ${INSTALLED_PACKAGES[*]} " =~ " ${package} " ]]; then
        INSTALLED_PACKAGES+=("$package")
    fi
}

# Function to add to already installed list
mark_already() {
    local package="$1"
    if [[ ! " ${ALREADY_SETUP_PACKAGES[*]} " =~ " ${package} " ]]; then
        ALREADY_SETUP_PACKAGES+=("$package")
    fi
}

# Function to add to skipped list
mark_skipped() {
    local package="$1"
    if [[ ! " ${SKIPPED_PACKAGES[*]} " =~ " ${package} " ]]; then
        SKIPPED_PACKAGES+=("$package")
    fi
}

# Function to announce step
announce() {
    local title="$1"
    echo ""
    echo -e "${CYAN}══ $title ══${NC}"
}

# Function to run commands or print them in dry-run mode
run_cmd() {
    if [[ "$DRY_RUN" == "true" ]]; then
        printf "Would run:"
        printf " %q" "$@"
        printf "\n"
    else
        "$@"
    fi
}

# Function to append a line to a file if it is missing
append_line_if_missing() {
    local line="$1"
    local file="$2"

    if [[ -f "$file" ]] && grep -Fqx "$line" "$file"; then
        return 0
    fi

    if [[ "$DRY_RUN" == "true" ]]; then
        echo "Would append to $file: $line"
    else
        mkdir -p "$(dirname "$file")"
        touch "$file"
        printf '%s\n' "$line" >> "$file"
    fi
}

# Function to resolve the Homebrew binary path
get_homebrew_bin() {
    if [[ -x "/opt/homebrew/bin/brew" ]]; then
        echo "/opt/homebrew/bin/brew"
    elif [[ -x "/usr/local/bin/brew" ]]; then
        echo "/usr/local/bin/brew"
    elif [[ "$(get_macos_arch)" == "arm64" ]]; then
        echo "/opt/homebrew/bin/brew"
    else
        echo "/usr/local/bin/brew"
    fi
}

# Function to resolve the Homebrew prefix
get_homebrew_prefix() {
    dirname "$(dirname "$(get_homebrew_bin)")"
}

# Function to ask for confirmation in interactive mode
prompt_yes_no() {
    local prompt="$1"
    local default_answer="${2:-Y}"
    local prompt_suffix
    local reply
    local normalized

    if [[ "$INTERACTIVE_MODE" != "true" ]]; then
        return 0
    fi

    if [[ "$default_answer" == "Y" ]]; then
        prompt_suffix="[Y/n]"
    else
        prompt_suffix="[y/N]"
    fi

    while true; do
        echo -n "$prompt $prompt_suffix "
        if ! read -r reply; then
            return 1
        fi

        normalized=$(printf '%s' "$reply" | tr '[:upper:]' '[:lower:]')
        case "$normalized" in
            "")
                [[ "$default_answer" == "Y" ]] && return 0 || return 1
                ;;
            y|yes)
                return 0
                ;;
            n|no)
                return 1
                ;;
            *)
                echo "Please answer yes or no."
                ;;
        esac
    done
}

confirm_action() {
    local prompt="$1"
    local default_answer="${2:-Y}"

    if prompt_yes_no "$prompt" "$default_answer"; then
        return 0
    fi

    return 1
}

ensure_homebrew_available() {
    local label="${1:-this step}"

    if command -v brew &>/dev/null; then
        return 0
    fi

    if [[ "$DRY_RUN" == "true" ]]; then
        return 0
    fi

    echo -e "${YELLOW}⚠ Homebrew is required for $label. Install the 'core' category first.${NC}"
    return 1
}

install_formula_if_missing() {
    local label="$1"
    local check_cmd="$2"
    shift 2

    if command -v "$check_cmd" &>/dev/null; then
        mark_already "$label"
        return 0
    fi

    if ! confirm_action "Install $label?" "Y"; then
        echo "Skipping $label"
        mark_skipped "$label"
        return 0
    fi

    if ! ensure_homebrew_available "$label"; then
        mark_skipped "$label"
        return 0
    fi

    run_cmd "$@"
    mark_installed "$label"
}

install_cask_if_missing() {
    local label="$1"
    local cask_name="$2"
    local app_path="${3:-}"

    if is_cask_installed "$cask_name"; then
        mark_already "$label"
        return 0
    fi

    if [[ -n "$app_path" && -d "$app_path" ]]; then
        mark_already "$label"
        return 0
    fi

    if ! confirm_action "Install $label?" "Y"; then
        echo "Skipping $label"
        mark_skipped "$label"
        return 0
    fi

    if ! ensure_homebrew_available "$label"; then
        mark_skipped "$label"
        return 0
    fi

    run_cmd brew install --cask "$cask_name"
    mark_installed "$label"
}

run_category_selection() {
    case "$1" in
        1|core)
            setup_core
            ;;
        2|dev-tools|devtools)
            setup_dev_tools
            ;;
        3|zed)
            setup_zed
            ;;
        4|productivity)
            setup_productivity
            ;;
        5|kubernetes|k8s)
            setup_kubernetes
            ;;
        6|cli-tools|clitools)
            setup_cli_tools
            ;;
        7|pi-extensions|piextensions)
            setup_pi_extensions
            ;;
        8|pi-skills|piskills)
            setup_pi_skills
            ;;
        all)
            setup_core
            setup_dev_tools
            setup_zed
            setup_productivity
            setup_kubernetes
            setup_cli_tools
            setup_pi_extensions
            setup_pi_skills
            ;;
        *)
            return 1
            ;;
    esac
}

# ───────────────────────────────────────────────────────────────────────────
# CORE SETUP
# ───────────────────────────────────────────────────────────────────────────
setup_core() {
    announce "Core Setup"

    local ARCH
    local brew_bin
    local shellenv_line
    local brew_ready=false

    ARCH=$(get_macos_arch)
    echo "Detected macOS architecture: $ARCH"

    # Install Homebrew
    if ! command -v brew &> /dev/null; then
        if confirm_action "Install Homebrew?" "Y"; then
            echo "Installing Homebrew..."
            if [[ "$DRY_RUN" == "true" ]]; then
                echo 'Would run: /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"'
            else
                /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
            fi
            brew_bin="$(get_homebrew_bin)"
            shellenv_line="eval \"\$($brew_bin shellenv)\""
            append_line_if_missing "$shellenv_line" "$HOME/.zprofile"
            if [[ "$DRY_RUN" == "true" ]]; then
                echo "Would run: eval \"\$($brew_bin shellenv)\""
            else
                eval "$($brew_bin shellenv)"
            fi
            mark_installed "Homebrew"
            brew_ready=true
        else
            echo "Skipping Homebrew"
            mark_skipped "Homebrew"
        fi
    else
        mark_already "Homebrew"
        brew_ready=true
    fi

    # Update Homebrew
    if command -v brew &>/dev/null || [[ "$brew_ready" == "true" ]]; then
        if confirm_action "Update Homebrew package metadata?" "Y"; then
            echo "Updating Homebrew..."
            run_cmd brew update
            mark_installed "Homebrew update"
        else
            echo "Skipping Homebrew update"
            mark_skipped "Homebrew update"
        fi
    else
        echo -e "${YELLOW}⚠ Skipping Homebrew update because Homebrew is not installed.${NC}"
        mark_skipped "Homebrew update"
    fi

    # Install Zsh
    if ! command -v zsh &> /dev/null; then
        if confirm_action "Install Zsh?" "Y"; then
            echo "Installing Zsh..."
            if ensure_homebrew_available "Zsh"; then
                run_cmd brew install zsh
                mark_installed "Zsh"
            else
                mark_skipped "Zsh"
            fi
        else
            echo "Skipping Zsh"
            mark_skipped "Zsh"
        fi
    else
        mark_already "Zsh"
    fi

    # Set Zsh as default shell if not already
    if [[ "$SHELL" != "/bin/zsh" ]]; then
        if confirm_action "Set Zsh as your default shell?" "Y"; then
            echo "Setting Zsh as default shell..."
            run_cmd chsh -s /bin/zsh
            echo "Note: Zsh has been set as your default shell. Please restart your terminal."
            mark_installed "Zsh (default shell)"
        else
            echo "Skipping default shell change"
            mark_skipped "Zsh (default shell)"
        fi
    else
        mark_already "Zsh (default shell)"
    fi

    # Install Oh My Zsh
    if [[ ! -d "$HOME/.oh-my-zsh" ]]; then
        if confirm_action "Install Oh My Zsh?" "Y"; then
            echo "Installing Oh My Zsh..."
            if [[ "$DRY_RUN" == "true" ]]; then
                echo 'Would run: sh -c "$(curl -fsSL https://raw.githubusercontent.com/ohmyzsh/ohmyzsh/master/tools/install.sh)" "" --unattended'
            else
                sh -c "$(curl -fsSL https://raw.githubusercontent.com/ohmyzsh/ohmyzsh/master/tools/install.sh)" "" --unattended
            fi
            mark_installed "Oh My Zsh"
        else
            echo "Skipping Oh My Zsh"
            mark_skipped "Oh My Zsh"
        fi
    else
        mark_already "Oh My Zsh"
    fi

    # Install Git
    if ! command -v git &> /dev/null; then
        if confirm_action "Install Git?" "Y"; then
            echo "Installing Git..."
            if ensure_homebrew_available "Git"; then
                run_cmd brew install git
                mark_installed "Git"
            else
                mark_skipped "Git"
            fi
        else
            echo "Skipping Git"
            mark_skipped "Git"
        fi
    else
        mark_already "Git"
    fi
}

# ───────────────────────────────────────────────────────────────────────────
# DEVELOPMENT TOOLS
# ───────────────────────────────────────────────────────────────────────────
setup_dev_tools() {
    announce "Development Tools"

    install_formula_if_missing "lazygit" "lazygit" brew install lazygit

    if ! command -v fzf &> /dev/null; then
        if confirm_action "Install fzf?" "Y"; then
            echo "Installing fzf..."
            if ensure_homebrew_available "fzf"; then
                run_cmd brew install fzf
                run_cmd "$(get_homebrew_prefix)/opt/fzf/install" --all --no-bash --no-fish
                mark_installed "fzf"
            else
                mark_skipped "fzf"
            fi
        else
            echo "Skipping fzf"
            mark_skipped "fzf"
        fi
    else
        mark_already "fzf"
    fi

    install_formula_if_missing "tmux" "tmux" brew install tmux
    install_cask_if_missing "VS Code" "visual-studio-code"
}

setup_zed() {
    announce "Zed"

    install_cask_if_missing "Zed" "zed" "/Applications/Zed.app"

    # Configure Zed
    ZED_CONFIG_DIR="$HOME/.config/zed"
    ZED_CONFIG_FILE="$ZED_CONFIG_DIR/settings.json"
    ZED_CONFIG_SRC="$(dirname "$0")/configs/zed/settings.json"

    if [[ -f "$ZED_CONFIG_FILE" ]]; then
        mark_already "Zed config"
    else
        if confirm_action "Configure Zed settings?" "Y"; then
            echo "Setting up Zed configuration..."
            if [[ "$DRY_RUN" == "true" ]]; then
                echo "Would copy $ZED_CONFIG_SRC to $ZED_CONFIG_FILE"
            else
                mkdir -p "$ZED_CONFIG_DIR"
                cp "$ZED_CONFIG_SRC" "$ZED_CONFIG_FILE"
            fi
            mark_installed "Zed config"
        else
            echo "Skipping Zed config"
            mark_skipped "Zed config"
        fi
    fi
}

# ───────────────────────────────────────────────────────────────────────────
# PRODUCTIVITY APPS
# ───────────────────────────────────────────────────────────────────────────
setup_productivity() {
    announce "Productivity Applications"

    install_cask_if_missing "Ghostty" "ghostty"

    # Configure Ghostty keybindings
    GHOSTTY_CONFIG_DIR="$HOME/.config/ghostty"
    GHOSTTY_CONFIG_FILE="$GHOSTTY_CONFIG_DIR/config"

    if [[ -d "$GHOSTTY_CONFIG_DIR" && -f "$GHOSTTY_CONFIG_FILE" ]]; then
        mark_already "Ghostty keybindings"
    else
        if confirm_action "Configure Ghostty keybindings?" "Y"; then
            echo "Setting up Ghostty configuration..."
            append_line_if_missing 'keybind = "ctrl+shift+r=reload_config"' "$GHOSTTY_CONFIG_FILE"
            append_line_if_missing 'keybind = "ctrl+shift+t=reset"' "$GHOSTTY_CONFIG_FILE"
            mark_installed "Ghostty keybindings"
        else
            echo "Skipping Ghostty keybindings"
            mark_skipped "Ghostty keybindings"
        fi
    fi

    install_cask_if_missing "Zen Browser" "zen"
    install_cask_if_missing "Obsidian" "obsidian"
    install_cask_if_missing "Rectangle" "rectangle"
    install_cask_if_missing "Bitwarden" "bitwarden"
}

# ───────────────────────────────────────────────────────────────────────────
# KUBERNETES TOOLS
# ───────────────────────────────────────────────────────────────────────────
setup_kubernetes() {
    announce "Kubernetes Tools"

    if [[ -d "/Applications/Docker.app" ]]; then
        mark_already "Docker"
    else
        if confirm_action "Install Docker Desktop?" "Y"; then
            echo "Installing Docker..."
            if ensure_homebrew_available "Docker"; then
                run_cmd brew install --cask docker
                mark_installed "Docker"
            else
                mark_skipped "Docker"
            fi
        else
            echo "Skipping Docker"
            mark_skipped "Docker"
        fi
    fi

    install_formula_if_missing "lazydocker" "lazydocker" brew install lazydocker
    install_formula_if_missing "kubectl" "kubectl" brew install kubectl
    install_formula_if_missing "Helm" "helm" brew install helm
    install_formula_if_missing "Minikube" "minikube" brew install minikube
    install_formula_if_missing "K9s" "k9s" brew install derailed/k9s/k9s
}

# ───────────────────────────────────────────────────────────────────────────
# CLI TOOLS
# ───────────────────────────────────────────────────────────────────────────
setup_cli_tools() {
    announce "Enhanced CLI Tools"

    install_formula_if_missing "bat" "bat" brew install bat
    install_formula_if_missing "eza" "eza" brew install eza

    if ! command -v rg &> /dev/null; then
        if confirm_action "Install ripgrep?" "Y"; then
            if ensure_homebrew_available "ripgrep"; then
                run_cmd brew install ripgrep
                mark_installed "ripgrep"
            else
                mark_skipped "ripgrep"
            fi
        else
            echo "Skipping ripgrep"
            mark_skipped "ripgrep"
        fi
    else
        mark_already "ripgrep"
    fi

    install_formula_if_missing "zellij" "zellij" brew install zellij
}

# ───────────────────────────────────────────────────────────────────────────
# PI EXTENSIONS ONLY
# ───────────────────────────────────────────────────────────────────────────
setup_pi_extensions() {
    announce "Pi Extensions Only"

    local PI_EXTENSIONS_SETUP
    local args=()
    local exit_code

    PI_EXTENSIONS_SETUP="$SCRIPT_DIR/pi-extensions/setup.sh"

    if [[ ! -f "$PI_EXTENSIONS_SETUP" ]]; then
        echo -e "${RED}✗${NC} pi-extensions/setup.sh not found"
        mark_skipped "Pi Extensions"
        return 0
    fi

    if [[ "$DRY_RUN" == "true" ]]; then
        args+=("--dry-run")
    fi
    if [[ "$FORCE" == "true" ]]; then
        args+=("--force")
    fi

    if [[ "$INTERACTIVE_MODE" != "true" ]]; then
        args+=("--all")
    fi

    if /bin/bash "$PI_EXTENSIONS_SETUP" "${args[@]}"; then
        mark_installed "Pi Extensions"
    else
        exit_code=$?
        if [[ $exit_code -eq 2 ]]; then
            echo "Skipping Pi Extensions"
            mark_skipped "Pi Extensions"
            return 0
        fi
        return $exit_code
    fi
}

setup_pi_skills() {
    announce "Pi Skills Only"

    local PI_SKILLS_SETUP
    local args=()
    local exit_code

    PI_SKILLS_SETUP="$SCRIPT_DIR/pi-skills/setup.sh"

    if [[ ! -f "$PI_SKILLS_SETUP" ]]; then
        echo -e "${RED}✗${NC} pi-skills/setup.sh not found"
        mark_skipped "Pi Skills"
        return 0
    fi

    if [[ "$DRY_RUN" == "true" ]]; then
        args+=("--dry-run")
    fi
    if [[ "$FORCE" == "true" ]]; then
        args+=("--force")
    fi

    if [[ "$INTERACTIVE_MODE" != "true" ]]; then
        args+=("--all")
    fi

    if /bin/bash "$PI_SKILLS_SETUP" "${args[@]}"; then
        mark_installed "Pi Skills"
    else
        exit_code=$?
        if [[ $exit_code -eq 2 ]]; then
            echo "Skipping Pi Skills"
            mark_skipped "Pi Skills"
            return 0
        fi
        return $exit_code
    fi
}

# ───────────────────────────────────────────────────────────────────────────
# SUMMARY
# ───────────────────────────────────────────────────────────────────────────
show_summary() {
    local package
    echo
    echo -e "${CYAN}Setup summary${NC}"

    if [[ ${#INSTALLED_PACKAGES[@]} -gt 0 ]]; then
        echo
        [[ "$DRY_RUN" == true ]] && echo "Planned:" || echo "Changed:"
        for package in "${INSTALLED_PACKAGES[@]}"; do echo -e "  ${GREEN}✓${NC} $package"; done
    fi
    if [[ ${#ALREADY_SETUP_PACKAGES[@]} -gt 0 ]]; then
        echo
        echo "Already set up:"
        for package in "${ALREADY_SETUP_PACKAGES[@]}"; do echo -e "  ${YELLOW}↺${NC} $package"; done
    fi
    if [[ ${#SKIPPED_PACKAGES[@]} -gt 0 ]]; then
        echo
        echo "Skipped:"
        for package in "${SKIPPED_PACKAGES[@]}"; do echo -e "  ${MAGENTA}•${NC} $package"; done
    fi
    if [[ ${#INSTALLED_PACKAGES[@]} -eq 0 && ${#ALREADY_SETUP_PACKAGES[@]} -eq 0 && ${#SKIPPED_PACKAGES[@]} -eq 0 ]]; then
        echo "  No changes."
    fi
    echo
}

# ───────────────────────────────────────────────────────────────────────────
# MAIN
# ───────────────────────────────────────────────────────────────────────────
main() {
    local category

    echo -e "${CYAN}Fresh macOS setup${NC}"
    [[ "$DRY_RUN" == true ]] && echo -e "${YELLOW}Dry run. Nothing will be changed.${NC}"
    echo

    if [[ -n "$CATEGORY" ]]; then
        if ! run_category_selection "$CATEGORY"; then
            echo -e "${RED}Unknown category: $CATEGORY${NC}" >&2
            echo "Use --help to see available categories." >&2
            exit 1
        fi
    elif [[ "$INSTALL_ALL" == true ]]; then
        run_category_selection "all"
    elif [[ "$INTERACTIVE_MODE" != true ]]; then
        echo -e "${RED}No categories selected.${NC} Use --all or --category <name> when running non-interactively." >&2
        exit 1
    else
        PICKER_TITLE="Fresh macOS setup"
        PICKER_VALUES=(core dev-tools zed productivity kubernetes cli-tools pi-extensions pi-skills)
        PICKER_LABELS=("Core" "Development tools" "Zed" "Productivity" "Kubernetes" "CLI tools" "Pi extensions" "Pi skills")
        PICKER_DETAILS=(
            "Homebrew, Zsh, Oh My Zsh, Git"
            "VS Code, lazygit, fzf, tmux"
            "Editor and bundled settings"
            "Ghostty, Rectangle, Obsidian, Zen, Bitwarden"
            "Docker, kubectl, Helm, Minikube, K9s"
            "bat, eza, ripgrep, zellij"
            "Commands, permission gate, diff review, web access"
            "Review, architecture, testing, and writing skills"
        )
        ui_pick || exit 0
        for category in "${PICKER_SELECTED[@]}"; do run_category_selection "$category"; done
    fi

    show_summary
}

main
