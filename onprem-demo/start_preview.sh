#!/usr/bin/env bash
cd /Users/vladyslavpresnov/Downloads/aison-0a2d1aaf-main/onprem-demo
exec /Users/vladyslavpresnov/Library/Python/3.9/bin/streamlit run app.py \
  --server.headless true \
  --server.address localhost \
  --server.port 8501 \
  --browser.gatherUsageStats false
