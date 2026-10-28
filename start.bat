@echo off
rem SPDX-License-Identifier: GPL-3.0-only
setlocal
cd /d "%~dp0"
where py >nul 2>nul
if %errorlevel%==0 (
  py -3 "%~dp0scripts\serve.py"
) else (
  where python >nul 2>nul
  if errorlevel 1 (
    echo Python 3.9 or later is required. Install Python and try again.
    pause
    exit /b 1
  )
  python "%~dp0scripts\serve.py"
)
if errorlevel 1 pause
