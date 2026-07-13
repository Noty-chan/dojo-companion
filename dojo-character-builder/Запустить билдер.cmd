@echo off
title Panic at the Dojo Companion
cd /d "%~dp0"

echo.
echo   Starting the "Panic at the Dojo" companion...
echo.

rem --- launch the dev server in a separate minimized window ---
start "Dojo Companion Server" /min cmd /c "npm run dev -- --port 5180 --strictPort"

rem --- wait until the server is listening (up to ~25 seconds) ---
set /a tries=0
:wait
>nul ping -n 2 127.0.0.1
netstat -aon | findstr ":5180" | findstr "LISTENING" >nul
if %errorlevel%==0 goto ready
set /a tries+=1
if %tries% GEQ 25 goto giveup
goto wait

:ready
start "" "http://127.0.0.1:5180/"
echo   Ready! The companion is open in your browser:
echo       http://127.0.0.1:5180/
echo.
echo   You can close this window now.
echo   To shut the companion down, double-click the STOP file next to this one.
>nul ping -n 7 127.0.0.1
exit

:giveup
echo   Could not start the server in time.
echo   Run the STOP file, then try again.
echo   If it keeps failing, open a terminal here and run once:  npm install
echo.
pause
exit
