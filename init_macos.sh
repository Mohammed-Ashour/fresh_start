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
#   core, dev-tools, productivity, kubernetes, pi, pi-extensions, pi-setup
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
            echo "  productivity   - Ghostty, Rectangle, Obsidian, Zen Browser"
            echo "  kubernetes     - Docker, kubectl, Helm, Minikube, K9s"
            echo "  cli-tools      - bat, eza, ripgrep, zellij, lazydocker"
            echo "  pi             - Full pi setup (settings, MCP, extensions)"
            echo "  pi-extensions  - Pi extensions only (web-search, exit, permissions)"
            echo "  pi-setup       - Pi settings + MCP config (no extensions)"
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
# PI SETUP (Settings + MCP, no extensions)
# ───────────────────────────────────────────────────────────────────────────
setup_pi_config() {
    announce "Pi Config (Settings + MCP)"
    
    PI_SETUP_DIR="$(dirname "$0")/pi-setup"
    
    if [[ -d "$PI_SETUP_DIR" ]]; then
        echo "Setting up pi configuration..."
        echo "  Source: $PI_SETUP_DIR"
        echo ""
        
        PI_DIR="${PI_CODING_AGENT_DIR:-$HOME/.pi/agent}"
        echo "  Target: $PI_DIR"
        echo ""
        
        # Setup config files
        if [[ -f "$PI_SETUP_DIR/config/settings.json" ]]; then
            if [[ -f "$PI_DIR/settings.json" ]]; then
                echo -e "  ${YELLOW}↺${NC} settings.json (already exists)"
                mark_already "Pi Settings"
            else
                mkdir -p "$PI_DIR"
                cp "$PI_SETUP_DIR/config/settings.json" "$PI_DIR/settings.json"
                echo -e "  ${GREEN}✓${NC} settings.json"
                mark_installed "Pi Settings"
            fi
        fi
        
        if [[ -f "$PI_SETUP_DIR/config/mcp.json" ]]; then
            if [[ -f "$PI_DIR/mcp.json" ]]; then
                echo -e "  ${YELLOW}↺${NC} mcp.json (already exists)"
                mark_already "Pi MCP Config"
            else
                cp "$PI_SETUP_DIR/config/mcp.json" "$PI_DIR/mcp.json"
                echo -e "  ${GREEN}✓${NC} mcp.json"
                mark_installed "Pi MCP Config"
            fi
        fi
        
        echo ""
        echo "Next steps:"
        echo "  1. Run: ./pi-extensions/setup.sh (to install extensions)"
        echo "  2. Restart pi or run: /reload"
    else
        echo -e "${RED}✗${NC} pi-setup directory not found"
        mark_already "Pi Config (skipped - not found)"
    fi
}

# ───────────────────────────────────────────────────────────────────────────
# FULL PI SETUP
# ───────────────────────────────────────────────────────────────────────────
setup_pi() {
    announce "Full Pi Setup"
    echo "This includes: pi-extensions + pi-config + pi-setup"
    echo ""
    
    setup_pi_config
    setup_pi_extensions
    
    echo ""
    echo "Pi setup complete!"
    echo "Restart pi or run /reload to apply changes."
}

# ───────────────────────────────────────────────────────────────────────────
# INTERACTIVE MENU
# ───────────────────────────────────────────────────────────────────────────
show_menu() {
    echo -e "${CYAN}"
    echo "╔══════════════════════════════════════════════════════════════════╗"
    echo "║                   Fresh macOS Setup Menu                         ║"
    echo "╠══════════════════════════════════════════════════════════════════╣"
    echo "║  1) Core                 - Homebrew, Zsh, Oh My Zsh, Git        ║"
    echo "║  2) Dev Tools            - VS Code, lazygit, fzf, tmux           ║"
    echo "║  3) Productivity         - Ghostty, Rectangle, Obsidian, Zen    ║"
    echo "║  4) Kubernetes           - Docker, kubectl, Helm, Minikube, K9s ║"
    echo "║  5) CLI Tools            - bat, eza, ripgrep, zellij            ║"
    echo "╠══════════════════════════════════════════════════════════════════╣"
    echo "║  6) Pi Extensions        - web-search, exit, permissions        ║"
    echo "║  7) Pi Config            - settings.json, mcp.json               ║"
    echo "║  8) Full Pi Setup        - All pi components                     ║"
    echo "╠══════════════════════════════════════════════════════════════════╣"
    echo "║  A) Install All           - Run all categories above             ║"
    echo "║  C) Custom Selection      - Choose specific categories           ║"
    echo "║  Q) Quit                  - Exit without installing              ║"
    echo "╚══════════════════════════════════════════════════════════════════╝"
    echo -e "${NC}"
}

custom_selection() {
    echo -e "${CYAN}"
    echo "╔══════════════════════════════════════════════════════════════════╗"
    echo "║                  Custom Category Selection                      ║"
    echo "╠══════════════════════════════════════════════════════════════════╣"
    echo "║  Select categories (e.g., '1 3 6'):                             ║"
    echo "║                                                                  ║"
    echo "║  1  - Core             (Homebrew, Zsh, Git)                    ║"
    echo "║  2  - Dev Tools         (VS Code, lazygit, fzf, tmux)           ║"
    echo "║  3  - Productivity      (Ghostty, Rectangle, Obsidian, Zen)    ║"
    echo "║  4  - Kubernetes        (Docker, kubectl, Helm, Minikube, K9s)  ║"
    echo "║  5  - CLI Tools         (bat, eza, ripgrep, zellij)            ║"
    echo "║  6  - Pi Extensions     (web-search, exit, permissions)        ║"
    echo "║  7  - Pi Config         (settings.json, mcp.json)              ║"
    echo "╚══════════════════════════════════════════════════════════════════╝"
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
            7) setup_pi_config ;;
        esac
    done
}

# ───────────────────────────────────────────────────────────────────────────
# SUMMARY
# ───────────────────────────────────────────────────────────────────────────
show_summary() {
    echo ""
    echo -e "${CYAN}═══════════════════════════════════════════════════════════════${NC}"
    echo -e "${CYAN}                       SETUP SUMMARY${NC}"
    echo -e "${CYAN}═══════════════════════════════════════════════════════════════${NC}"
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
    echo -e "${CYAN}═══════════════════════════════════════════════════════════════${NC}"
    echo -e "${CYAN}                      SETUP COMPLETE${NC}"
    echo -e "${CYAN}═══════════════════════════════════════════════════════════════${NC}"
    echo ""
}

# ───────────────────────────────────────────────────────────────────────────
# MAIN
# ───────────────────────────────────────────────────────────────────────────
main() {
    # Header
    echo -e "${CYAN}"
    echo "╔══════════════════════════════════════════════════════════════════╗"
    echo "║                    Fresh macOS Setup                            ║"
    echo "║              Modular Development Environment                    ║"
    echo "╚══════════════════════════════════════════════════════════════════╝"
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
            pi) setup_pi ;;
            pi-extensions|piextensions) setup_pi_extensions ;;
            pi-setup|piconfig) setup_pi_config ;;
            all) setup_core; setup_dev_tools; setup_productivity; setup_kubernetes; setup_cli_tools; setup_pi ;;
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
            7) setup_pi_config ;;
            8) setup_pi ;;
            a|A) 
                setup_core
                setup_dev_tools
                setup_productivity
                setup_kubernetes
                setup_cli_tools
                setup_pi
                ;;
            c|C) custom_selection ;;
            q|Q) echo "Exiting..."; exit 0 ;;
            *) echo -e "${RED}Invalid option${NC}"; exit 1 ;;
        esac
    fi
    
    show_summary
}

main
