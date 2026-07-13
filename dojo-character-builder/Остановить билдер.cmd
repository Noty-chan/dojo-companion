@echo off
title Panic at the Dojo Companion - stop

echo.
echo   Stopping the companion...

set found=0
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":5180" ^| findstr "LISTENING"') do (
  taskkill /PID %%a /T /F >nul 2>&1
  set found=1
)

echo.
if "%found%"=="1" (
  echo   Companion stopped.
) else (
  echo   Companion was not running ^(port 5180 is free^).
)
>nul ping -n 4 127.0.0.1
exit
