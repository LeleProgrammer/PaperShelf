@echo off
rem SPDX-License-Identifier: GPL-3.0-only
cd /d "%~dp0"
echo PaperShelf - http://localhost:8000
echo Keep this window open. Press Ctrl+C to stop.
where py >nul 2>nul
if %errorlevel%==0 (
  py -3 -m http.server 8000 --bind 127.0.0.1 --directory dist
) else (
  python -m http.server 8000 --bind 127.0.0.1 --directory dist
)
pause
