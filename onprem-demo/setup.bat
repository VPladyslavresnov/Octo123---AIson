@echo off
REM setup.bat — One-time setup for the On-Prem Analysis Agent demo (Windows)

SET MODEL=qwen3:14b
IF NOT "%OLLAMA_MODEL%"=="" SET MODEL=%OLLAMA_MODEL%

echo.
echo === On-Prem Analysis Agent - Setup ===
echo.

REM --- 1. Ollama ---
where ollama >nul 2>&1
IF ERRORLEVEL 1 (
    echo Ollama not found. Please install it from https://ollama.com/download
    echo Then re-run this script.
    pause
    exit /b 1
) ELSE (
    echo [OK] Ollama installed
)

REM --- 2. Pull model ---
echo.
echo Pulling model: %MODEL%  (may take a while on first run^)
ollama pull %MODEL%
echo [OK] Model ready

REM --- 3. Python venv ---
echo.
python --version
IF NOT EXIST ".venv\" (
    echo Creating virtual environment...
    python -m venv .venv
)
echo Installing Python dependencies...
.venv\Scripts\pip install --quiet --upgrade pip
.venv\Scripts\pip install --quiet -r requirements.txt
echo [OK] Python environment ready

echo.
echo === Setup complete ===
echo.
echo To start the demo:
echo   1. ollama serve       (in a separate terminal, if not running)
echo   2. run.bat
echo.
pause
