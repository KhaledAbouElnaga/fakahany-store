@echo off
setlocal
cd /d "%~dp0"
if not exist "src\pages\CheckoutPage.tsx" (
  echo ERROR: Put these fix files inside the main fakahany-store folder first.
  echo The folder must contain src\pages\CheckoutPage.tsx
  pause
  exit /b 1
)
copy /Y "src\pages\CheckoutPage.tsx" "src\pages\CheckoutPage.tsx.backup" >nul
copy /Y "patch\CheckoutPage.tsx" "src\pages\CheckoutPage.tsx" >nul
if errorlevel 1 (
  echo ERROR: Fix could not be applied.
  pause
  exit /b 1
)
echo WhatsApp message fix applied successfully.
echo Restart START-STORE.bat now.
pause
