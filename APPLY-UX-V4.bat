@echo off
setlocal
cd /d "%~dp0"
title Fakahany Store - UX V4 Update

echo Applying UX V4 update...
echo.

if not exist "src" (
  echo ERROR: Copy this BAT file and the patch folder into the main fakahany-store folder first.
  echo The same folder must contain START-STORE.bat and src.
  pause
  exit /b 1
)

if not exist "patch\src" (
  echo ERROR: patch folder is missing.
  pause
  exit /b 1
)

if not exist "backup-before-v4\src" (
  echo Creating backup of current source files...
  xcopy /E /I /Y "src" "backup-before-v4\src" >nul
)

echo Updating source files...
xcopy /E /I /Y "patch\src" "src" >nul

if errorlevel 1 (
  echo ERROR: Could not copy the update files.
  pause
  exit /b 1
)

echo.
echo UX V4 update applied successfully.
echo.
echo IMPORTANT:
echo 1. Run MIGRATION-V4-REQUIRED-FIELDS.sql once in Supabase SQL Editor.
echo 2. Restart START-STORE.bat.
echo.
pause
