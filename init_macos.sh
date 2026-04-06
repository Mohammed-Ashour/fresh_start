#!/bin/bash

# ═══════════════════════════════════════════════════════════════════════════
#                          Fresh macOS Setup
# ═══════════════════════════════════════════════════════════════════════════
#
# Interactive macOS development environment setup with modular components.
#
# Usage:
#   ./init_macos.sh                    # Interactive mode (menu)
#   ./init_macos.sh --all              # Install everything
#   ./init_macos.sh --category <name>  # Install specific category
#   ./init_macos.sh --dry-run          # Show what would be done
#
# Categories:
#   core, dev-tools, productivity, kubernetes, cli-tools, pi-extensions
#
# ═══════════════════════════════════════════════════════════════════════════

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
MAGENTA='\033[0;35m'
NC='\033[0m' # No Color

# Box drawing constants
BOX_WIDTH=68  # Inner width (excluding border characters)

# Function to print a box line with proper padding
box_line() {
    local content="$1"
    local len=${#content}
    local padding=$((BOX_WIDTH - len))
    printf "║ %s%${padding}s ║\n" "$content" ""
}

# Function to print a separator line
box_sep() {
    echo "╠══════════════════════════════════════════════════════════════════════╣"
}

# Arrays to store installation status
INSTALLED_PACKAGES=()
ALREADY_SETUP_PACKAGES=()
SKIPPED_PACKAGES=()

# Options
DRY_RUN=false
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
        --category)
            CATEGORY="$2"
            shift 2
            ;;
        --help|-h)
            echo "Usage: $0 [options]"
            echo ""
            echo "Options:"
            echo "  --dry-run            Show what would be done without making changes"
            echo "  --all                Install everything"
            echo "  --category <name>    Install specific category"
            echo "  --help               Show this help message"
            echo ""
            echo "Categories:"
            echo "  core           - Homebrew, Zsh, Oh My Zsh, Git"
            echo "  dev-tools      - VS Code, lazygit, fzf, tmux"
            echo "  productivity   - Ghostty, Rectangle, Obsidian, Zen, Bitwarden"
            echo "  kubernetes     - Docker, kubectl, Helm, Minikube, K9s"
            echo "  cli-tools      - bat, eza, ripgrep, zellij, lazydocker"
            echo "  pi-extensions  - Pi extensions (web-search, exit, permissions)"
            exit 0
            ;;
        *)
            echo "Unknown option: $1"
            exit 1
            ;;
    esac
done

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

# Function to announce step
announce() {
    local title="$1"
    echo ""
    echo -e "${CYAN}══ $title ══${NC}"
}

# ───────────────────────────────────────────────────────────────────────────
# CORE SETUP
# ───────────────────────────────────────────────────────────────────────────
setup_core() {
    announce "Core Setup"
    
    ARCH=$(get_macos_arch)
    echo "Detected macOS architecture: $ARCH"
    
    # Install Homebrew
    if ! command -v brew &> /dev/null; then
        echo "Installing Homebrew..."
        /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
        echo 'eval "$(/opt/homebrew/bin/brew shellenv)"' >> ~/.zprofile
        eval "$(/opt/homebrew/bin/brew shellenv)"
        mark_installed "Homebrew"
    else
        mark_already "Homebrew"
    fi
    
    # Update Homebrew
    echo "Updating Homebrew..."
    brew update
    
    # Install Zsh
    if ! command -v zsh &> /dev/null; then
        echo "Installing Zsh..."
        brew install zsh
        mark_installed "Zsh"
    else
        mark_already "Zsh"
    fi
    
    # Set Zsh as default shell if not already
    if [[ "$SHELL" != "/bin/zsh" ]]; then
        echo "Setting Zsh as default shell..."
        chsh -s /bin/zsh
        echo "Note: Zsh has been set as your default shell. Please restart your terminal."
        mark_installed "Zsh (default shell)"
    else
        mark_already "Zsh (default shell)"
    fi
    
    # Install Oh My Zsh
    if [ ! -d "$HOME/.oh-my-zsh" ]; then
        echo "Installing Oh My Zsh..."
        sh -c "$(curl -fsSL https://raw.githubusercontent.com/ohmyzsh/ohmyzsh/master/tools/install.sh)" "" --unattended
        mark_installed "Oh My Zsh"
    else
        mark_already "Oh My Zsh"
    fi
    
    # Install Git
    if ! command -v git &> /dev/null; then
        echo "Installing Git..."
        brew install git
        mark_installed "Git"
    else
        mark_already "Git"
    fi
}

# ───────────────────────────────────────────────────────────────────────────
# DEVELOPMENT TOOLS
# ───────────────────────────────────────────────────────────────────────────
setup_dev_tools() {
    announce "Development Tools"
    
    # Install lazygit
    if ! command -v lazygit &> /dev/null; then
        brew install lazygit
        mark_installed "lazygit"
    else
        mark_already "lazygit"
    fi
    
    # Install fzf
    if ! command -v fzf &> /dev/null; then
        echo "Installing fzf..."
        brew install fzf
        "$(brew --prefix)/opt/fzf/install" --all --no-bash --no-fish
        mark_installed "fzf"
    else
        mark_already "fzf"
    fi
    
    # Install tmux
    if ! command -v tmux &> /dev/null; then
        brew install tmux
        mark_installed "tmux"
    else
        mark_already "tmux"
    fi
    
    # Install VS Code
    if ! is_cask_installed "visual-studio-code"; then
        brew install --cask visual-studio-code
        mark_installed "VS Code"
    else
        mark_already "VS Code"
    fi
}

# ───────────────────────────────────────────────────────────────────────────
# PRODUCTIVITY APPS
# ───────────────────────────────────────────────────────────────────────────
setup_productivity() {
    announce "Productivity Applications"
    
    # Install Ghostty
    if ! is_cask_installed "ghostty"; then
        brew install --cask ghostty
        mark_installed "Ghostty"
    else
        mark_already "Ghostty"
    fi
    
    # Configure Ghostty keybindings
    GHOSTTY_CONFIG_DIR="$HOME/.config/ghostty"
    GHOSTTY_CONFIG_FILE="$GHOSTTY_CONFIG_DIR/config"
    
    if [[ -d "$GHOSTTY_CONFIG_DIR" && -f "$GHOSTTY_CONFIG_FILE" ]]; then
        mark_already "Ghostty keybindings"
    else
        echo "Setting up Ghostty configuration..."
        mkdir -p "$GHOSTTY_CONFIG_DIR"
        if ! grep -q "ctrl+shift+r=reload_config" "$GHOSTTY_CONFIG_FILE" 2>/dev/null; then
            echo 'keybind = "ctrl+shift+r=reload_config"' >> "$GHOSTTY_CONFIG_FILE"
        fi
        if ! grep -q "ctrl+shift+t=reset" "$GHOSTTY_CONFIG_FILE" 2>/dev/null; then
            echo 'keybind = "ctrl+shift+t=reset"' >> "$GHOSTTY_CONFIG_FILE"
        fi
        mark_installed "Ghostty keybindings"
    fi
    
    # Install Zen Browser
    if ! is_cask_installed "zen"; then
        brew install --cask zen
        mark_installed "Zen Browser"
    else
        mark_already "Zen Browser"
    fi
    
    # Install Obsidian
    if ! is_cask_installed "obsidian"; then
        brew install --cask obsidian
        mark_installed "Obsidian"
    else
        mark_already "Obsidian"
    fi
    
    # Install Rectangle
    if ! is_cask_installed "rectangle"; then
        brew install --cask rectangle
        mark_installed "Rectangle"
    else
        mark_already "Rectangle"
    fi
    
    # Install Bitwarden
    if ! is_cask_installed "bitwarden"; then
        brew install --cask bitwarden
        mark_installed "Bitwarden"
    else
        mark_already "Bitwarden"
    fi
}

# ───────────────────────────────────────────────────────────────────────────
# KUBERNETES TOOLS
# ───────────────────────────────────────────────────────────────────────────
setup_kubernetes() {
    announce "Kubernetes Tools"
    
    # Install Docker Desktop
    if [ -d "/Applications/Docker.app" ]; then
        mark_already "Docker"
    else
        echo "Installing Docker..."
        brew install --cask docker
        mark_installed "Docker"
    fi
    
    # Install lazydocker
    if ! command -v lazydocker &> /dev/null; then
        brew install lazydocker
        mark_installed "lazydocker"
    else
        mark_already "lazydocker"
    fi
    
    # Install kubectl
    if ! command -v kubectl &> /dev/null; then
        brew install kubectl
        mark_installed "kubectl"
    else
        mark_already "kubectl"
    fi
    
    # Install Helm
    if ! command -v helm &> /dev/null; then
        brew install helm
        mark_installed "Helm"
    else
        mark_already "Helm"
    fi
    
    # Install Minikube
    if ! command -v minikube &> /dev/null; then
        brew install minikube
        mark_installed "Minikube"
    else
        mark_already "Minikube"
    fi
    
    # Install K9s
    if ! command -v k9s &> /dev/null; then
        brew install derailed/k9s/k9s
        mark_installed "K9s"
    else
        mark_already "K9s"
    fi
}

# ───────────────────────────────────────────────────────────────────────────
# CLI TOOLS
# ───────────────────────────────────────────────────────────────────────────
setup_cli_tools() {
    announce "Enhanced CLI Tools"
    
    if ! command -v bat &> /dev/null; then
        brew install bat
        mark_installed "bat"
    else
        mark_already "bat"
    fi
    
    if ! command -v eza &> /dev/null; then
        brew install eza
        mark_installed "eza"
    else
        mark_already "eza"
    fi
    
    if ! command -v rg &> /dev/null; then
        brew install ripgrep
        mark_installed "ripgrep"
    else
        mark_already "ripgrep"
    fi
    
    if ! command -v zellij &> /dev/null; then
        brew install zellij
        mark_installed "zellij"
    else
        mark_already "zellij"
    fi
}

# ───────────────────────────────────────────────────────────────────────────
# PI EXTENSIONS ONLY
# ───────────────────────────────────────────────────────────────────────────
setup_pi_extensions() {
    announce "Pi Extensions Only"
    
    PI_EXTENSIONS_SETUP="$(dirname "$0")/pi-extensions/setup.sh"
    
    if [[ -f "$PI_EXTENSIONS_SETUP" ]]; then
        if [[ "$DRY_RUN" == "true" ]]; then
            echo "Would run: $PI_EXTENSIONS_SETUP --dry-run"
        else
            chmod +x "$PI_EXTENSIONS_SETUP"
            "$PI_EXTENSIONS_SETUP" --force
        fi
        mark_installed "Pi Extensions"
    else
        echo -e "${RED}✗${NC} pi-extensions/setup.sh not found"
        mark_already "Pi Extensions (skipped - not found)"
    fi
}

# ───────────────────────────────────────────────────────────────────────────
# INTERACTIVE MENU
# ───────────────────────────────────────────────────────────────────────────
show_menu() {
    echo -e "${CYAN}"
    echo "╔══════════════════════════════════════════════════════════════════════╗"
    box_line "Fresh macOS Setup Menu"
    box_sep
    box_line "1) Core          - Homebrew, Zsh, Oh My Zsh, Git"
    box_line "2) Dev Tools     - VS Code, lazygit, fzf, tmux"
    box_line "3) Productivity  - Ghostty, Rectangle, Obsidian, Zen, Bitwarden"
    box_line "4) Kubernetes    - Docker, kubectl, Helm, Minikube, K9s"
    box_line "5) CLI Tools     - bat, eza, ripgrep, zellij"
    box_sep
    box_line "6) Pi Extensions - web-search, exit, permissions"
    box_sep
    box_line "A) Install All   - Run all categories above"
    box_line "C) Custom Select - Choose specific categories"
    box_line "Q) Quit         - Exit without installing"
    echo "╚══════════════════════════════════════════════════════════════════════╝"
    echo -e "${NC}"
}

custom_selection() {
    echo -e "${CYAN}"
    echo "╔══════════════════════════════════════════════════════════════════════╗"
    box_line "Custom Category Selection"
    box_sep
    box_line "Select categories (e.g., '1 3 6'):"
    box_line ""
    box_line "1  - Core          (Homebrew, Zsh, Git)"
    box_line "2  - Dev Tools     (VS Code, lazygit, fzf, tmux)"
    box_line "3  - Productivity  (Ghostty, Rectangle, Obsidian, Zen, Bitwarden)"
    box_line "4  - Kubernetes    (Docker, kubectl, Helm, Minikube, K9s)"
    box_line "5  - CLI Tools     (bat, eza, ripgrep, zellij)"
    box_line "6  - Pi Extensions (web-search, exit, permissions)"
    echo "╚══════════════════════════════════════════════════════════════════════╝"
    echo -e "${NC}"
    echo -n "Enter selection: "
    read -r selection
    
    for item in $selection; do
        case $item in
            1) setup_core ;;
            2) setup_dev_tools ;;
            3) setup_productivity ;;
            4) setup_kubernetes ;;
            5) setup_cli_tools ;;
            6) setup_pi_extensions ;;
        esac
    done
}

# ───────────────────────────────────────────────────────────────────────────
# SUMMARY
# ───────────────────────────────────────────────────────────────────────────
show_summary() {
    echo ""
    echo -e "${CYAN}════════════════════════════════════════════════════════════════════════${NC}"
    echo -e "${CYAN}                         SETUP SUMMARY${NC}"
    echo -e "${CYAN}════════════════════════════════════════════════════════════════════════${NC}"
    echo ""
    
    echo "Installed:"
    if [ ${#INSTALLED_PACKAGES[@]} -gt 0 ]; then
        for PACKAGE in "${INSTALLED_PACKAGES[@]}"; do
            echo -e "  ${GREEN}✓${NC} $PACKAGE"
        done
    else
        echo "  (none)"
    fi
    
    echo ""
    echo "Already set up:"
    if [ ${#ALREADY_SETUP_PACKAGES[@]} -gt 0 ]; then
        for PACKAGE in "${ALREADY_SETUP_PACKAGES[@]}"; do
            echo -e "  ${YELLOW}↺${NC} $PACKAGE"
        done
    else
        echo "  (none)"
    fi
    
    echo ""
    echo -e "${CYAN}════════════════════════════════════════════════════════════════════════${NC}"
    echo -e "${CYAN}                        SETUP COMPLETE${NC}"
    echo -e "${CYAN}════════════════════════════════════════════════════════════════════════${NC}"
    echo ""
}

# ───────────────────────────────────────────────────────────────────────────
# MAIN
# ───────────────────────────────────────────────────────────────────────────
main() {
    # Header
    echo -e "${CYAN}"
    echo "╔══════════════════════════════════════════════════════════════════════╗"
    box_line "Fresh macOS Setup"
    box_line "Modular Development Environment"
    box_sep
    box_line "Select an option to begin or press Ctrl+C to exit"
    echo "╚══════════════════════════════════════════════════════════════════════╝"
    echo -e "${NC}"
    
    if [[ "$DRY_RUN" == "true" ]]; then
        echo -e "${YELLOW}DRY RUN MODE - No changes will be made${NC}"
        echo ""
    fi
    
    if [[ -n "$CATEGORY" ]]; then
        # Single category mode
        case "$CATEGORY" in
            core) setup_core ;;
            dev-tools|devtools) setup_dev_tools ;;
            productivity) setup_productivity ;;
            kubernetes|k8s) setup_kubernetes ;;
            cli-tools|clitools) setup_cli_tools ;;
            pi-extensions|piextensions) setup_pi_extensions ;;
            all) setup_core; setup_dev_tools; setup_productivity; setup_kubernetes; setup_cli_tools; setup_pi_extensions ;;
            *)
                echo -e "${RED}Unknown category: $CATEGORY${NC}"
                echo "Use --help to see available categories"
                exit 1
                ;;
        esac
    elif [[ "$INSTALL_ALL" == "true" ]]; then
        # Install all mode
        setup_core
        setup_dev_tools
        setup_productivity
        setup_kubernetes
        setup_cli_tools
        setup_pi
    else
        # Interactive menu mode
        show_menu
        echo -n "Select option: "
        read -r choice
        
        case "$choice" in
            1) setup_core ;;
            2) setup_dev_tools ;;
            3) setup_productivity ;;
            4) setup_kubernetes ;;
            5) setup_cli_tools ;;
            6) setup_pi_extensions ;;
            a|A) 
                setup_core
                setup_dev_tools
                setup_productivity
                setup_kubernetes
                setup_cli_tools
                setup_pi_extensions
                ;;
            c|C) custom_selection ;;
            q|Q) echo "Exiting..."; exit 0 ;;
            *) echo -e "${RED}Invalid option${NC}"; exit 1 ;;
        esac
    fi
    
    show_summary
}

main
