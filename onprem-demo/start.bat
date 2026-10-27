@echo off
REM ─────────────────────────────────────────────────────────────────────────────
REM GMS On-Prem Analysis Agent — start.bat
REM
REM One command:  start.bat
REM
REM Requires: Docker Desktop for Windows  OR  Python 3 + Ollama installed
REM ─────────────────────────────────────────────────────────────────────────────

SET MODEL=%OLLAMA_MODEL%
IF "%MODEL%"=="" SET MODEL=qwen3:14b
SET PORT=%PORT%
IF "%PORT%"=="" SET PORT=8501

echo.
echo   GMS Analysis Agent
echo   ────────────────────────────────
echo.

REM ── Try Docker first ────────────────────────────────────────────────────────
where docker >nul 2>&1
IF NOT ERRORLEVEL 1 (
    docker info >nul 2>&1
    IF NOT ERRORLEVEL 1 (
        echo [Docker] Starting with Docker Compose...
        echo First run downloads ~9 GB (Ollama + model). Subsequent starts are instant.
        echo App will be at: http://localhost:%PORT%
        echo Press Ctrl-C to stop.
        echo.
        docker compose up --build
        EXIT /B 0
    )
)

REM ── Native fallback ──────────────────────────────────────────────────────────
echo [Native] Docker not found — using native install.
echo.

REM Check Ollama
where ollama >nul 2>&1
IF ERRORLEVEL 1 (
    echo Ollama not found.
    echo Download and install it from: https://ollama.com/download
    echo Then re-run this script.
    pause
    EXIT /B 1
)
echo [OK] Ollama installed

REM Pull model
ollama list | findstr /I "%MODEL:~0,6%" >nul 2>&1
IF ERRORLEVEL 1 (
    echo Pulling model: %MODEL% (one-time download, ~9 GB^)...
    ollama pull %MODEL%
)
echo [OK] Model: %MODEL%

REM Check Python
where python >nul 2>&1
IF ERRORLEVEL 1 (
    echo Python not found. Install from https://python.org and re-run.
    pause
    EXIT /B 1
)

REM Create venv
IF NOT EXIST ".venv" (
    echo Creating virtual environment...
    python -m venv .venv
)

echo Installing dependencies...
.venv\Scripts\pip install --quiet --upgrade pip
.venv\Scripts\pip install --quiet -r requirements.txt
echo [OK] Dependencies installed

REM Start Ollama in background
curl -sf http://localhost:11434/api/tags >nul 2>&1
IF ERRORLEVEL 1 (
    echo Starting Ollama server...
    START /B ollama serve
    timeout /t 8 /nobreak >nul
)

REM Launch app
echo.
echo Starting app at http://localhost:%PORT%
echo Press Ctrl-C to stop.
echo.
.venv\Scripts\streamlit run app.py --server.headless true --server.address localhost --server.port %PORT%
