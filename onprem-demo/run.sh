#!/usr/bin/env bash
# run.sh — Start the On-Prem Analysis Agent demo

set -euo pipefail

if [ ! -d ".venv" ]; then
  echo "ERROR: Virtual environment not found. Run ./setup.sh first."
  exit 1
fi

echo "Starting Streamlit app…"
echo "Open: http://localhost:8501"
echo "Press Ctrl+C to stop."
echo ""

# Ollama must be running separately: ollama serve
.venv/bin/streamlit run app.py \
  --server.headless true \
  --browser.gatherUsageStats false \
  --server.address localhost \
  --server.port 8501
