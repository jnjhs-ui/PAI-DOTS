#!/usr/bin/env bash
# PAI-DOTS Bootstrap Script
# Interactive setup for first-time installation
#
# Usage: bash bootstrap.sh

set -euo pipefail

echo ""
echo "╔══════════════════════════════════════╗"
echo "║        PAI-DOTS Setup Wizard         ║"
echo "║  DevLog + Overwatch + Tasks System   ║"
echo "╚══════════════════════════════════════╝"
echo ""

# Detect OS
OS="unknown"
case "$(uname -s)" in
  Darwin*) OS="macos" ;;
  Linux*)  OS="linux" ;;
  MINGW*|MSYS*|CYGWIN*) OS="windows" ;;
esac
echo "  Platform: $OS"

# Find script directory (PAI-DOTS repo root)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
echo "  PAI-DOTS: $SCRIPT_DIR"

# Check for Bun
if command -v bun &>/dev/null; then
  BUN_VERSION=$(bun --version 2>/dev/null || echo "unknown")
  echo "  Bun: v$BUN_VERSION ✓"
else
  echo "  Bun: not found"
  echo ""
  read -p "  Install Bun? (recommended) [Y/n] " -n 1 -r
  echo ""
  if [[ ! $REPLY =~ ^[Nn]$ ]]; then
    curl -fsSL https://bun.sh/install | bash
    echo "  Bun installed. You may need to restart your shell."
    # Source bun into current session
    export BUN_INSTALL="${BUN_INSTALL:-$HOME/.bun}"
    export PATH="$BUN_INSTALL/bin:$PATH"
  else
    echo "  ⚠️  Bun is required for hooks. Install later: curl -fsSL https://bun.sh/install | bash"
  fi
fi

# Check for Claude Code
if command -v claude &>/dev/null; then
  echo "  Claude Code: ✓"
else
  echo "  Claude Code: not found"
  echo "  ⚠️  Install from: https://claude.ai/code"
fi

echo ""

# Symlink setup
CLAUDE_DIR="$HOME/.claude"

if [ -L "$CLAUDE_DIR" ]; then
  CURRENT_TARGET=$(readlink "$CLAUDE_DIR" 2>/dev/null || readlink -f "$CLAUDE_DIR" 2>/dev/null)
  echo "  ~/.claude is already a symlink → $CURRENT_TARGET"
  if [ "$CURRENT_TARGET" = "$SCRIPT_DIR/.claude" ]; then
    echo "  Already pointing to this PAI-DOTS install. ✓"
  else
    read -p "  Re-point to this install? [y/N] " -n 1 -r
    echo ""
    if [[ $REPLY =~ ^[Yy]$ ]]; then
      rm "$CLAUDE_DIR"
      ln -s "$SCRIPT_DIR/.claude" "$CLAUDE_DIR"
      echo "  Symlink updated. ✓"
    fi
  fi
elif [ -d "$CLAUDE_DIR" ]; then
  echo "  ~/.claude exists as a directory."
  read -p "  Back up and replace with symlink? [y/N] " -n 1 -r
  echo ""
  if [[ $REPLY =~ ^[Yy]$ ]]; then
    BACKUP="$HOME/.claude.backup.$(date +%Y%m%d%H%M%S)"
    mv "$CLAUDE_DIR" "$BACKUP"
    echo "  Backed up to: $BACKUP"
    ln -s "$SCRIPT_DIR/.claude" "$CLAUDE_DIR"
    echo "  Symlink created. ✓"
  fi
else
  ln -s "$SCRIPT_DIR/.claude" "$CLAUDE_DIR"
  echo "  Symlink created: ~/.claude → $SCRIPT_DIR/.claude ✓"
fi

echo ""

# Create .env if needed
ENV_FILE="$SCRIPT_DIR/.claude/.env"
ENV_EXAMPLE="$SCRIPT_DIR/.claude/.env.example"
if [ -f "$ENV_EXAMPLE" ] && [ ! -f "$ENV_FILE" ]; then
  cp "$ENV_EXAMPLE" "$ENV_FILE"
  echo "  Created .env from template. Edit to add API keys."
fi

# Install pre-commit hook
HOOK_FILE="$SCRIPT_DIR/.git/hooks/pre-commit"
if [ -d "$SCRIPT_DIR/.git/hooks" ]; then
  cat > "$HOOK_FILE" << 'HOOK'
#!/usr/bin/env bash
# PAI-DOTS: block commits containing secrets or PII
REPO_ROOT="$(git rev-parse --show-toplevel)"
if command -v bun &>/dev/null; then
  bun "$REPO_ROOT/.claude/tools/validate-protected.ts" "$REPO_ROOT"
fi
HOOK
  chmod +x "$HOOK_FILE"
  echo "  Pre-commit hook installed (PII/secret scan). ✓"
fi

# Prompt user to fill in pii_strings
echo ""
echo "  ⚠️  Add your real name and email to .protected.json → pii_strings"
echo "     This prevents accidental PII commits."

# Run self-test if Bun is available
if command -v bun &>/dev/null; then
  echo ""
  echo "Running self-test..."
  bun "$SCRIPT_DIR/.claude/tools/self-test.ts" || true
fi

echo ""
echo "Setup complete. Start Claude Code with: claude"
echo ""
