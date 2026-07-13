@echo off
title Panic at the Dojo Companion - stop online link

echo.
echo   Stopping temporary online link...

set found=0
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":5180" ^| findstr "LISTENING"') do (
  taskkill /PID %%a /T /F >nul 2>&1
  set found=1
)

taskkill /IM cloudflared.exe /T /F >nul 2>&1
if %errorlevel%==0 set found=1

echo.
if "%found%"=="1" (
  echo   Online link stopped.
) else (
  echo   No temporary online link was running.
)
>nul ping -n 4 127.0.0.1
exit
