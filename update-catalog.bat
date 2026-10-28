@echo off
rem SPDX-License-Identifier: GPL-3.0-only
cd /d "%~dp0"
where py >nul 2>nul
if %errorlevel%==0 (
  py -3 scripts\update_catalog.py
) else (
  python scripts\update_catalog.py
)
pause
