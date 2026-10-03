@echo off
setlocal
cd /d "%~dp0"
title Fakahany Store - Install
where node >nul 2>&1
if errorlevel 1 goto NO_NODE
echo Installing required packages...
call npm install --no-audit --no-fund
if errorlevel 1 goto ERR
echo.
echo Installation completed successfully.
pause
exit /b 0
:NO_NODE
echo Node.js is not installed. Install the LTS version from https://nodejs.org/en/download
start "" "https://nodejs.org/en/download"
pause
exit /b 1
:ERR
echo Installation failed. Take a screenshot and send it to ChatGPT.
pause
exit /b 1
