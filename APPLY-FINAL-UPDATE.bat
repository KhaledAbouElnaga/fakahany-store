@echo off
setlocal
cd /d "%~dp0"

if not exist "patch\src" (
  echo ERROR: patch folder is missing.
  pause
  exit /b 1
)

if not exist "src" (
  echo ERROR: Put this BAT file and the patch folder inside your fakahany-store project folder first.
  pause
  exit /b 1
)

if exist "FINAL-BACKUP" rmdir /s /q "FINAL-BACKUP"
mkdir "FINAL-BACKUP"
xcopy "src" "FINAL-BACKUP\src\" /E /I /Y >nul
if exist "public" xcopy "public" "FINAL-BACKUP\public\" /E /I /Y >nul
if exist "index.html" copy /Y "index.html" "FINAL-BACKUP\index.html" >nul

xcopy "patch\src" "src\" /E /I /Y >nul
xcopy "patch\public" "public\" /E /I /Y >nul
copy /Y "patch\index.html" "index.html" >nul

if not exist "supabase" mkdir "supabase"
copy /Y "MIGRATION-FINAL.sql" "supabase\MIGRATION-FINAL.sql" >nul

echo.
echo FINAL UPDATE APPLIED SUCCESSFULLY.
echo A backup was created in FINAL-BACKUP.
echo Now restart START-STORE.bat.
echo.
pause
