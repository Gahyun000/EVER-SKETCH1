@echo off
setlocal
cd /d "%~dp0"
where py >nul 2>nul
if %ERRORLEVEL% EQU 0 (
  py -3 tools\dev_standard\devctl.py %*
) else (
  python tools\dev_standard\devctl.py %*
)
set EXIT_CODE=%ERRORLEVEL%
if not "%DEV_STANDARD_NO_PAUSE%"=="1" pause
exit /b %EXIT_CODE%
