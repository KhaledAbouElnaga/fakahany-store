@echo off
setlocal
cd /d "%~dp0"
title Fakahany Store

echo ========================================
echo        FAKAHANY STORE - START
echo ========================================
echo.

where node >nul 2>&1
if errorlevel 1 goto NO_NODE

where npm >nul 2>&1
if errorlevel 1 goto NO_NPM

if not exist node_modules goto INSTALL

goto RUN

:INSTALL
echo First run detected.
echo Installing required packages...
echo This may take a few minutes.
echo.
call npm install --no-audit --no-fund
if errorlevel 1 goto INSTALL_ERROR

echo.
echo Installation completed successfully.
echo.

:RUN
echo Starting the store...
echo.
echo Customer store:
echo http://localhost:5173
echo.
echo Admin dashboard:
echo http://localhost:5173/admin
echo.
echo Keep this window open while using the store.
echo Press Ctrl+C to stop the server.
echo.
start "" cmd /c "timeout /t 3 /nobreak >nul & start http://localhost:5173"
call npm run dev -- --host 127.0.0.1
pause
exit /b 0

:NO_NODE
echo ERROR: Node.js is not installed on this computer.
echo.
echo The official Node.js website will open now.
echo Install the LTS version, then run START-STORE.bat again.
echo.
start "" "https://nodejs.org/en/download"
pause
exit /b 1

:NO_NPM
echo ERROR: npm was not found.
echo Reinstall Node.js LTS, then run START-STORE.bat again.
pause
exit /b 1

:INSTALL_ERROR
echo.
echo ERROR: Package installation failed.
echo Take a screenshot of this window and send it to ChatGPT.
pause
exit /b 1
