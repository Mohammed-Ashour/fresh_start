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

# Install Homebrew
if ! command -v brew &> /dev/null; then
  echo "Homebrew not found. Installing Homebrew..."
  /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
  echo 'eval "$(/opt/homebrew/bin/brew shellenv)"' >> ~/.zprofile
  eval "$(/opt/homebrew/bin/brew shellenv)"
else
  echo "Homebrew is already installed."
fi

# Update Homebrew
echo "Updating Homebrew..."
brew update

# Install Zsh
echo "Installing Zsh..."
brew install zsh

# Set Zsh as default shell if not already
if [[ "$SHELL" != "/bin/zsh" ]]; then
  echo "Setting Zsh as default shell..."
  chsh -s /bin/zsh
else
  echo "Zsh is already the default shell."
fi

# Install Oh My Zsh
if [ ! -d "$HOME/.oh-my-zsh" ]; then
  echo "Installing Oh My Zsh..."
  sh -c "$(curl -fsSL https://raw.githubusercontent.com/ohmyzsh/ohmyzsh/master/tools/install.sh)" "" --unattended
else
  echo "Oh My Zsh is already installed."
fi

# Install Powerlevel10k theme
echo "Installing Powerlevel10k theme..."
if [ ! -d "${ZSH_CUSTOM:-$HOME/.oh-my-zsh/custom}/themes/powerlevel10k" ]; then
  git clone --depth=1 https://github.com/romkatv/powerlevel10k.git ${ZSH_CUSTOM:-$HOME/.oh-my-zsh/custom}/themes/powerlevel10k
else
  echo "Powerlevel10k is already cloned."
fi

# Set Powerlevel10k as the Zsh theme
echo "Setting ZSH_THEME to powerlevel10k/powerlevel10k in ~/.zshrc..."
sed -i '' 's/ZSH_THEME="[^"]*"/ZSH_THEME="powerlevel10k\/powerlevel10k"/' ~/.zshrc

# Install Ghostty
echo "Installing Ghostty..."
brew install --cask ghostty

# Configure Ghostty keybindings
GHOSTTY_CONFIG_DIR="$HOME/.config/ghostty"
GHOSTTY_CONFIG_FILE="$GHOSTTY_CONFIG_DIR/config"

echo "Setting up Ghostty configuration..."
mkdir -p "$GHOSTTY_CONFIG_DIR"

# Add keybinds to Ghostty config if they don't already exist
if ! grep -q "keybind = \"ctrl+shift+r=reload_config\"" "$GHOSTTY_CONFIG_FILE" 2>/dev/null; then
  echo '# Rebind reload_config to Ctrl+Shift+R' >> "$GHOSTTY_CONFIG_FILE"
  echo 'keybind = "ctrl+shift+r=reload_config"' >> "$GHOSTTY_CONFIG_FILE"
fi

if ! grep -q "keybind = \"ctrl+shift+t=reset\"" "$GHOSTTY_CONFIG_FILE" 2>/dev/null; then
  echo '# Add a keybinding for the reset action to Ctrl+Shift+T' >> "$GHOSTTY_CONFIG_FILE"
  echo 'keybind = "ctrl+shift+t=reset"' >> "$GHOSTTY_CONFIG_FILE"
fi

# Install VS Code
echo "Installing VS Code..."
brew install --cask visual-studio-code

# Install tmux
echo "Installing tmux..."
brew install tmux

# Install Zen Browser
echo "Installing Zen Browser..."
brew install --cask zen

echo "Installation complete."
echo "Please restart your terminal or run 'source ~/.zshrc' to apply the new Zsh theme."