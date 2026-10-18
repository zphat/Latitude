@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Install Node.js 22.12 or newer from https://nodejs.org, then run this file again.
  pause
  exit /b 1
)
if not exist node_modules\electron\dist\electron.exe (
  echo Setting up Latitude. This first run needs internet access.
  call npm ci
  if errorlevel 1 goto failed
  call npm run setup
  if errorlevel 1 goto failed
)
call npm start
if errorlevel 1 goto failed
exit /b 0
:failed
echo.
echo Latitude could not start. See the error above and README.md.
pause
exit /b 1
