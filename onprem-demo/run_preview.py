#!/usr/bin/env python3
"""Wrapper for preview_start: patches Path.cwd() before Streamlit loads."""
import os, pathlib, sys

_APP_DIR = "/Users/vladyslavpresnov/Downloads/aison-0a2d1aaf-main/onprem-demo"

# Patch both os.getcwd and pathlib.Path.cwd so Streamlit can find its config
os.getcwd = lambda: _APP_DIR
pathlib.Path.cwd = classmethod(lambda cls: cls(_APP_DIR))

# Change the actual process directory too
os.chdir(_APP_DIR)

# Inject streamlit run args and hand off to the CLI
sys.argv = [
    "streamlit", "run", "app.py",
    "--server.headless", "true",
    "--server.address", "localhost",
    "--server.port", "8501",
    "--browser.gatherUsageStats", "false",
]

from streamlit.web.cli import main
main()
