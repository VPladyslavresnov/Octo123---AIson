@echo off
REM run.bat — Start the On-Prem Analysis Agent demo (Windows)

IF NOT EXIST ".venv\" (
    echo ERROR: Virtual environment not found. Run setup.bat first.
    pause
    exit /b 1
)

echo Starting Streamlit app...
echo Open: http://localhost:8501
echo Press Ctrl+C to stop.
echo.

.venv\Scripts\streamlit run app.py ^
  --server.headless true ^
  --browser.gatherUsageStats false ^
  --server.address localhost ^
  --server.port 8501
