#!/usr/bin/env bash
# setup.sh — One-time setup for the On-Prem Analysis Agent demo
# Tested on macOS and Ubuntu 22.04

set -euo pipefail

MODEL="${OLLAMA_MODEL:-qwen3:14b}"

echo ""
echo "=== On-Prem Analysis Agent — Setup ==="
echo ""

# --- 1. Ollama ---
if ! command -v ollama &>/dev/null; then
  echo "Installing Ollama…"
  if [[ "$OSTYPE" == "darwin"* ]]; then
    # macOS
    if command -v brew &>/dev/null; then
      brew install ollama
    else
      curl -fsSL https://ollama.com/install.sh | sh
    fi
  else
    # Linux
    curl -fsSL https://ollama.com/install.sh | sh
  fi
else
  echo "✓ Ollama already installed ($(ollama --version 2>/dev/null || echo 'version unknown'))"
fi

# --- 2. Pull model ---
echo ""
echo "Pulling model: $MODEL  (this may take a while on first run)"
ollama pull "$MODEL"
echo "✓ Model ready: $MODEL"

# --- 3. Python venv ---
echo ""
PYTHON="$(command -v python3 || command -v python)"
echo "Using Python: $("$PYTHON" --version)"

if [ ! -d ".venv" ]; then
  echo "Creating virtual environment…"
  "$PYTHON" -m venv .venv
fi

echo "Installing Python dependencies…"
.venv/bin/pip install --quiet --upgrade pip
.venv/bin/pip install --quiet -r requirements.txt
echo "✓ Python environment ready"

echo ""
echo "=== Setup complete ==="
echo ""
echo "To start the demo:"
echo "  1.  ollama serve          # in a separate terminal (or it may already be running)"
echo "  2.  ./run.sh"
echo ""
