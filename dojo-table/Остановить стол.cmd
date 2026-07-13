@echo off
title Panic at the Dojo Table - stop

echo.
echo   Stopping the table...

set found=0
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":5181" ^| findstr "LISTENING"') do (
  taskkill /PID %%a /T /F >nul 2>&1
  set found=1
)

echo.
if "%found%"=="1" (
  echo   Table stopped.
) else (
  echo   Table was not running ^(port 5181 is free^).
)
>nul ping -n 4 127.0.0.1
exit
