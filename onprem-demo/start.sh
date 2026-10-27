#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# GMS On-Prem Analysis Agent — start.sh
#
# One command:  ./start.sh
#
# Chooses the best available runtime automatically:
#   • Docker (recommended) → docker compose up
#   • Native              → sets up venv + Ollama if needed, then launches
#
# macOS / Linux only. Windows: run start.bat instead.
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

MODEL="${OLLAMA_MODEL:-qwen3:14b}"
PORT="${PORT:-8501}"

GREEN="\033[0;32m"; YELLOW="\033[1;33m"; RED="\033[0;31m"; NC="\033[0m"
info()  { echo -e "${GREEN}▸${NC} $*"; }
warn()  { echo -e "${YELLOW}⚠${NC}  $*"; }
error() { echo -e "${RED}✗${NC}  $*" >&2; }

cd "$(dirname "$0")"   # always run from the script's own directory

echo ""
echo "  GMS Analysis Agent"
echo "  ────────────────────────────────"
echo ""

# ── PATH A: Docker Compose ───────────────────────────────────────────────────
if command -v docker &>/dev/null && docker info &>/dev/null 2>&1; then
    info "Docker detected — using Docker Compose (recommended)"
    echo ""
    echo "  First run downloads ~9 GB (Ollama image + qwen3:14b)."
    echo "  Subsequent starts are instant — model is cached in a Docker volume."
    echo ""
    echo "  App will be available at:  http://localhost:${PORT}"
    echo "  Press Ctrl-C to stop."
    echo ""
    PORT="${PORT}" docker compose up --build
    exit 0
fi

# ── PATH B: Native (no Docker) ───────────────────────────────────────────────
warn "Docker not found — falling back to native install."
echo ""

# 1. Ollama
if ! command -v ollama &>/dev/null; then
    info "Installing Ollama…"
    if [[ "$OSTYPE" == "darwin"* ]]; then
        if command -v brew &>/dev/null; then
            brew install ollama
        else
            curl -fsSL https://ollama.com/install.sh | sh
        fi
    else
        curl -fsSL https://ollama.com/install.sh | sh
    fi
else
    info "Ollama already installed ($(ollama --version 2>/dev/null || echo 'version unknown'))"
fi

# 2. Model
if ollama list 2>/dev/null | grep -q "${MODEL%%:*}"; then
    info "Model ${MODEL} already present"
else
    info "Pulling model: ${MODEL}  (one-time download, ~9 GB)"
    ollama pull "$MODEL"
fi

# 3. Python venv
PYTHON="$(command -v python3 2>/dev/null || command -v python 2>/dev/null || true)"
if [ -z "$PYTHON" ]; then
    error "Python 3 not found. Install it from https://python.org and re-run."
    exit 1
fi

if [ ! -d ".venv" ]; then
    info "Creating Python virtual environment…"
    "$PYTHON" -m venv .venv
fi

info "Installing Python dependencies…"
.venv/bin/pip install --quiet --upgrade pip
.venv/bin/pip install --quiet -r requirements.txt

# 4. Start Ollama in background (if not already running)
if ! curl -sf http://localhost:11434/api/tags &>/dev/null; then
    info "Starting Ollama server in background…"
    ollama serve &>/tmp/ollama.log &
    OLLAMA_PID=$!
    # Wait for it to be ready
    for i in $(seq 1 20); do
        sleep 1
        if curl -sf http://localhost:11434/api/tags &>/dev/null; then
            break
        fi
    done
    if ! curl -sf http://localhost:11434/api/tags &>/dev/null; then
        error "Ollama failed to start. Check /tmp/ollama.log"
        exit 1
    fi
    info "Ollama ready"
else
    info "Ollama already running"
fi

# 5. Launch app
echo ""
info "Starting app at http://localhost:${PORT}"
echo "  Press Ctrl-C to stop."
echo ""

.venv/bin/streamlit run app.py \
    --server.headless true \
    --server.address localhost \
    --server.port "$PORT"
