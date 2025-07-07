#!/bin/bash

# Function to detect the macOS architecture
get_macos_arch() {
  if /usr/bin/arch | grep -q "arm64"; then
    echo "arm64"
  else
    echo "intel"
  fi
}

# Get the architecture
ARCH=$(get_macos_arch)
echo "Detected macOS architecture: $ARCH"

# Arrays to store installation status
INSTALLED_PACKAGES=()
ALREADY_SETUP_PACKAGES=()

# Install Homebrew
if ! command -v brew &> /dev/null; then
  echo "Homebrew not found. Installing Homebrew..."
  /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
  echo 'eval "$(/opt/homebrew/bin/brew shellenv)"' >> ~/.zprofile
  eval "$(/opt/homebrew/bin/brew shellenv)"
  INSTALLED_PACKAGES+=("Homebrew")
else
  echo "Homebrew is already installed."
  ALREADY_SETUP_PACKAGES+=("Homebrew")
fi

# Update Homebrew
echo "Updating Homebrew..."
brew update

# Install Zsh
echo "Installing Zsh..."
if ! command -v zsh &> /dev/null; then
  brew install zsh
  INSTALLED_PACKAGES+=("Zsh")
else
  echo "Zsh is already installed."
  ALREADY_SETUP_PACKAGES+=("Zsh")
fi

# Set Zsh as default shell if not already
if [[ "$SHELL" != "/bin/zsh" ]]; then
  echo "Setting Zsh as default shell..."
  chsh -s /bin/zsh
  # This change requires a new shell session to take effect.
  # We can't immediately add it to installed if it's "set" here, as it needs user action.
  echo "Note: Zsh has been set as your default shell. Please restart your terminal for this change to take effect."
else
  echo "Zsh is already the default shell."
fi

# Install Oh My Zsh
if [ ! -d "$HOME/.oh-my-zsh" ]; then
  echo "Installing Oh My Zsh..."
  sh -c "$(curl -fsSL https://raw.githubusercontent.com/ohmyzsh/ohmyzsh/master/tools/install.sh)" "" --unattended
  INSTALLED_PACKAGES+=("Oh My Zsh")
else
  echo "Oh My Zsh is already installed."
  ALREADY_SETUP_PACKAGES+=("Oh My Zsh")
fi
# --- Install Git ---
# Install Git
echo "Installing Git..."
if ! command -v git &> /dev/null; then
  brew install git
  INSTALLED_PACKAGES+=("Git")
else
  echo "Git is already installed."
  ALREADY_SETUP_PACKAGES+=("Git")
fi

# install lazygit
echo "Installing lazygit..."
if ! command -v lazygit &> /dev/null; then
  brew install lazygit
  INSTALLED_PACKAGES+=("lazygit")
else
  echo "lazygit is already installed."
  ALREADY_SETUP_PACKAGES+=("lazygit")
fi

# ----

# --- Install Zsh plugins ---

# Install Powerlevel10k theme
echo "Installing Powerlevel10k theme..."
if [ ! -d "${ZSH_CUSTOM:-$HOME/.oh-my-zsh/custom}/themes/powerlevel10k" ]; then
  git clone --depth=1 https://github.com/romkatv/powerlevel10k.git ${ZSH_CUSTOM:-$HOME/.oh-my-zsh/custom}/themes/powerlevel10k
  INSTALLED_PACKAGES+=("Powerlevel10k theme")
else
  echo "Powerlevel10k is already cloned."
  ALREADY_SETUP_PACKAGES+=("Powerlevel10k theme")
fi

# Set Powerlevel10k as the Zsh theme
echo "Setting ZSH_THEME to powerlevel10k/powerlevel10k in ~/.zshrc..."
if ! grep -q 'ZSH_THEME="powerlevel10k/powerlevel10k"' ~/.zshrc; then
  sed -i '' 's/ZSH_THEME="[^"]*"/ZSH_THEME="powerlevel10k\/powerlevel10k"/' ~/.zshrc
  INSTALLED_PACKAGES+=("Powerlevel10k theme set in Zsh config")
else
  echo "Powerlevel10k theme is already set in ~/.zshrc."
  ALREADY_SETUP_PACKAGES+=("Powerlevel10k theme set in Zsh config")
fi

# Install fzf
echo "Installing fzf..."
if ! command -v fzf &> /dev/null; then
  brew install fzf
  # Install fzf key bindings and fuzzy completion
  "$(brew --prefix)/opt/fzf/install" --all --no-bash --no-fish
  INSTALLED_PACKAGES+=("fzf (and key bindings/completion)")
else
  echo "fzf is already installed."
  ALREADY_SETUP_PACKAGES+=("fzf")
fi

# Install Ghostty
echo "Installing Ghostty..."
if ! brew list --cask ghostty &>/dev/null; then
  brew install --cask ghostty
  INSTALLED_PACKAGES+=("Ghostty")
else
  echo "Ghostty is already installed."
  ALREADY_SETUP_PACKAGES+=("Ghostty")
fi

# Configure Ghostty keybindings
GHOSTTY_CONFIG_DIR="$HOME/.config/ghostty"
GHOSTTY_CONFIG_FILE="$GHOSTTY_CONFIG_DIR/config"

echo "Setting up Ghostty configuration..."
mkdir -p "$GHOSTTY_CONFIG_DIR"

GHOSTTY_KEYBINDS_ADDED=false
# Add keybinds to Ghostty config if they don't already exist
if ! grep -q "keybind = \"ctrl+shift+r=reload_config\"" "$GHOSTTY_CONFIG_FILE" 2>/dev/null; then
  echo '# Rebind reload_config to Ctrl+Shift+R' >> "$GHOSTTY_CONFIG_FILE"
  echo 'keybind = "ctrl+shift+r=reload_config"' >> "$GHOSTTY_CONFIG_FILE"
  GHOSTTY_KEYBINDS_ADDED=true
fi

if ! grep -q "keybind = \"ctrl+shift+t=reset\"" "$GHOSTTY_CONFIG_FILE" 2>/dev/null; then
  echo '# Add a keybinding for the reset action to Ctrl+Shift+T' >> "$GHOSTTY_CONFIG_FILE"
  echo 'keybind = "ctrl+shift+t=reset"' >> "$GHOSTTY_CONFIG_FILE"
  GHOSTTY_KEYBINDS_ADDED=true
fi

if [ "$GHOSTTY_KEYBINDS_ADDED" = true ]; then
  INSTALLED_PACKAGES+=("Ghostty keybindings")
else
  echo "Ghostty keybindings were already present."
  ALREADY_SETUP_PACKAGES+=("Ghostty keybindings")
fi

# Install VS Code
echo "Installing VS Code..."
if ! brew list --cask visual-studio-code &>/dev/null; then
  brew install --cask visual-studio-code
  INSTALLED_PACKAGES+=("VS Code")
else
  echo "VS Code is already installed."
  ALREADY_SETUP_PACKAGES+=("VS Code")
fi

# Install tmux
echo "Installing tmux..."
if ! command -v tmux &> /dev/null; then
  brew install tmux
  INSTALLED_PACKAGES+=("tmux")
else
  echo "tmux is already installed."
  ALREADY_SETUP_PACKAGES+=("tmux")
fi

# Install Zen Browser
echo "Installing Zen Browser..."
if ! brew list --cask zen &>/dev/null; then
  brew install --cask zen
  INSTALLED_PACKAGES+=("Zen Browser")
else
  echo "Zen Browser is already installed."
  ALREADY_SETUP_PACKAGES+=("Zen Browser")
fi


# Install Docker Desktop
// Check if Docker is already installed
if [ -d "/Applications/Docker.app" ]; then
    echo "Docker is already installed."
    ALREADY_SETUP_PACKAGES+=("Docker")
else
    echo "Docker is not installed. Installing Docker..."
    brew install --cask docker
    INSTALLED_PACKAGES+=("Docker")
fi

# Install lazydocker
echo "Installing lazydocker..."
if ! command -v lazydocker &> /dev/null; then
  brew install lazydocker
  INSTALLED_PACKAGES+=("lazydocker")
else
  echo "lazydocker is already installed."
  ALREADY_SETUP_PACKAGES+=("lazydocker")
fi

# Install Kubectl
echo "Installing kubectl..."
if ! command -v kubectl &> /dev/null; then
  brew install kubectl
  INSTALLED_PACKAGES+=("kubectl")
else
  echo "kubectl is already installed."
  ALREADY_SETUP_PACKAGES+=("kubectl")
fi

# Install Helm
echo "Installing Helm..."
if ! command -v helm &> /dev/null; then
  brew install helm
  INSTALLED_PACKAGES+=("Helm")  
else
  echo "Helm is already installed."
  ALREADY_SETUP_PACKAGES+=("Helm")
fi

# Install Minikube
echo "Installing Minikube..."
if ! command -v minikube &> /dev/null; then
  brew install minikube
  INSTALLED_PACKAGES+=("Minikube")
else
  echo "Minikube is already installed."
  ALREADY_SETUP_PACKAGES+=("Minikube")
fi
# Install K9s
echo "Installing K9s..."
if ! command -v k9s &> /dev/null; then
  brew install derailed/k9s/k9s
  INSTALLED_PACKAGES+=("K9s")
else
  echo "K9s is already installed."
  ALREADY_SETUP_PACKAGES+=("K9s")
fi



# --- Additional Productivity Applications ---

# Install Rectangle (Window Manager)
if [ -d "/Applications/Rectangle.app" ]; then
    echo "Rectangle is already installed."
    ALREADY_SETUP_PACKAGES+=("Rectangle")
else
    echo "Rectangle is not installed. Installing Rectangle..."
    brew install --cask rectangle
    INSTALLED_PACKAGES+=("Rectangle")
fi

# --- Install Zellij  Terminal  Multiplexer ---

# Install Zellij Terminal Multiplexer
echo "Installing Zellij..."
if ! command -v zellij &> /dev/null; then
  brew install zellij
  INSTALLED_PACKAGES+=("Zellij")
else
  echo "Zellij is already installed."
  ALREADY_SETUP_PACKAGES+=("Zellij")
fi

# --- Enhanced CLI Utilities ---

echo "Installing enhanced CLI tools (bat, eza, ripgrep, jq)..."
if ! command -v bat &> /dev/null; then
  echo "Installing bat..."
  brew install bat
  INSTALLED_PACKAGES+=("bat")
else
  echo "bat is already installed."
  ALREADY_SETUP_PACKAGES+=("bat")
fi
if ! command -v eza &> /dev/null; then
  echo "Installing eza..."
  brew install eza
  INSTALLED_PACKAGES+=("eza")
else
  echo "eza is already installed."
  ALREADY_SETUP_PACKAGES+=("eza")
fi
if ! command -v rg &> /dev/null; then
  echo "Installing ripgrep (rg)..."
  brew install ripgrep
  INSTALLED_PACKAGES+=("ripgrep")
else
  echo "ripgrep (rg) is already installed."
  ALREADY_SETUP_PACKAGES+=("ripgrep")
fi

echo "




████████████████████████████████████████████████████████████████████████████████
█                                                                              █
█                            SETUP SUMMARY                                     █
█                                                                              █
████████████████████████████████████████████████████████████████████████████████

"

echo "Packages successfully installed or configured:"
if [ ${#INSTALLED_PACKAGES[@]} -gt 0 ]; then
  for PACKAGE in "${INSTALLED_PACKAGES[@]}"; do
    echo "  - $PACKAGE"
  done
else
  echo "  (No new packages were installed or configured during this run.)"
fi

echo "
Packages already set up or found existing:"
if [ ${#ALREADY_SETUP_PACKAGES[@]} -gt 0 ]; then
  for PACKAGE in "${ALREADY_SETUP_PACKAGES[@]}"; do
    echo "  - $PACKAGE"
  done
else
  echo "  (All specified packages were installed or configured as new.)"
fi

echo "
████████████████████████████████████████████████████████████████████████████████
█                                                                              █
█                            SETUP COMPLETE                                    █
█                                                                              █
████████████████████████████████████████████████████████████████████████████████

Please restart your terminal or run 'source ~/.zshrc' to fully apply the Zsh theme and shell changes."