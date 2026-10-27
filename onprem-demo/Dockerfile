FROM python:3.11-slim

WORKDIR /app

# Install deps (cached layer — only rebuilt when requirements change)
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# App source
COPY app.py analysis_engine.py deck_generator.py ollama_client.py ./
COPY samples/ samples/
COPY .streamlit/ .streamlit/

EXPOSE 8501

HEALTHCHECK --interval=10s --timeout=5s --retries=6 \
  CMD curl -sf http://localhost:8501/_stcore/health || exit 1

CMD ["streamlit", "run", "app.py", \
     "--server.headless=true", \
     "--server.address=0.0.0.0", \
     "--server.port=8501"]
