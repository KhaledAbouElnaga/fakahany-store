@echo off
setlocal
cd /d "%~dp0"
title Fakahany Store - Run
if not exist node_modules goto NEED_INSTALL
echo Store: http://localhost:5173
echo Admin: http://localhost:5173/admin
echo Keep this window open. Press Ctrl+C to stop.
start "" cmd /c "timeout /t 3 /nobreak >nul & start http://localhost:5173"
call npm run dev -- --host 127.0.0.1
pause
exit /b 0
:NEED_INSTALL
echo Please run 1-INSTALL-FIRST-TIME.bat first, or just run START-STORE.bat.
pause
exit /b 1
