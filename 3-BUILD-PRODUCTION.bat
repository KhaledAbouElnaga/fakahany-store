@echo off
setlocal
cd /d "%~dp0"
title Fakahany Store - Build
call npm run build
if errorlevel 1 goto ERR
echo.
echo Production build created in the dist folder.
pause
exit /b 0
:ERR
echo Build failed. Take a screenshot and send it to ChatGPT.
pause
exit /b 1
