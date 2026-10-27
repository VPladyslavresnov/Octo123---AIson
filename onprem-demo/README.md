# GMS On-Prem Analysis Agent

Upload two Excel files → get a branded strategy deck + grounded Q&A.  
**Zero data egress. Fully offline. Everything runs on your laptop.**

---

## Quickstart

### Mac / Linux
```bash
./start.sh
```

### Windows
```
start.bat
```

Open **http://localhost:8501** — that's it.

> **First run** downloads ~9 GB (Ollama + the `qwen3:14b` model).  
> Subsequent starts are **instant** — model weights are cached locally.

---

## Requirements

| With Docker (recommended) | Without Docker |
|---|---|
| [Docker Desktop](https://www.docker.com/products/docker-desktop/) | Python 3.11+ |
| Nothing else needed | [Ollama](https://ollama.com/download) |

`start.sh` / `start.bat` detects Docker automatically and uses it if present. If not, it installs Ollama and creates a Python venv for you.

---

## How to use it

1. **Upload** stress-test results (File A) and traffic data (File B — the one with `DETAIL INT` + `DETAIL NAT` sheets).
2. **Choose** an objective (Revenue Leakage, Security Audit, …).
3. Click **Run Analysis & Generate Deck**.
4. Download the `.pptx`, then ask follow-up questions in the chat.

---

## What it finds (GMS stress-test format)

| Finding | Proof method |
|---|---|
| Grey aggregator sender IDs | One sender ID → ≥2 unrelated brands = grey aggregator |
| Leakage scale | Grey sender IDs matched to File B domestic volume (DETAIL NAT) |
| Flash / voice OTP bypass | Null SMSC GT + real brand = voice OTP bypassing SMS |
| Grey-only brands | Present in File A grey paths, absent from official SMSFW |
| Route distribution | SMSC GT prefix → domestic / roaming / foreign |
| Market context | Domestic A2P total vs official international SMSFW |

All figures are computed deterministically by pandas — the local LLM (`qwen3:14b`) writes narrative prose only and cannot invent or change numbers.

---

## Security

- **No outbound calls.** Ollama is hardcoded to `localhost:11434`; a guard fires at import time and blocks any non-local URL.
- **Files never leave your machine.** Uploads are processed in memory and written to local temp only.
- **No telemetry.** Streamlit usage stats disabled via `.streamlit/config.toml`.
- Verified: disconnect your network and the tool still works.

---

## Configuration

```bash
# Different model (must be pulled first with: ollama pull <model>)
OLLAMA_MODEL=gemma3:12b ./start.sh

# Different port
PORT=8080 ./start.sh

# Docker only — override model in docker-compose.yml or via env:
OLLAMA_MODEL=gemma3:12b docker compose up
```

---

## Files

```
onprem-demo/
├── start.sh / start.bat   ← the one command
├── app.py                 ← Streamlit UI
├── analysis_engine.py     ← deterministic two-pass analysis (pandas)
├── deck_generator.py      ← python-pptx deck builder
├── ollama_client.py       ← local Ollama HTTP wrapper (localhost only)
├── requirements.txt
├── docker-compose.yml
├── Dockerfile
└── samples/               ← synthetic sample data for a quick demo
```
