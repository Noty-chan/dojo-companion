@echo off
title Panic at the Dojo Table
cd /d "%~dp0"

echo.
echo   Starting the "Panic at the Dojo" table...
echo.

rem --- launch the dev server in a separate minimized window ---
start "Dojo Table Server" /min cmd /c "npm run dev -- --port 5181 --strictPort"

rem --- wait until the server is listening (up to ~25 seconds) ---
set /a tries=0
:wait
>nul ping -n 2 127.0.0.1
netstat -aon | findstr ":5181" | findstr "LISTENING" >nul
if %errorlevel%==0 goto ready
set /a tries+=1
if %tries% GEQ 25 goto giveup
goto wait

:ready
start "" "http://127.0.0.1:5181/"
echo   Ready! The table is open in your browser:
echo       http://127.0.0.1:5181/
echo.
echo   You can close this window now.
echo   To shut the table down, double-click the STOP file next to this one.
>nul ping -n 7 127.0.0.1
exit

:giveup
echo   Could not start the server in time.
echo   Run the STOP file, then try again.
echo   If it keeps failing, open a terminal here and run once:  npm install
echo.
pause
exit
