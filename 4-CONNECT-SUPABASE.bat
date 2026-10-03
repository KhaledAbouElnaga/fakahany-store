@echo off
setlocal
cd /d "%~dp0"
title Fakahany Store - Connect Supabase
echo Paste your Supabase Project URL and press Enter:
set /p SBURL=
echo.
echo Paste your Supabase anon public key and press Enter:
set /p SBKEY=
> .env echo VITE_SUPABASE_URL=%SBURL%
>> .env echo VITE_SUPABASE_ANON_KEY=%SBKEY%
echo.
echo Connection file created successfully.
echo Restart the store using START-STORE.bat.
pause
