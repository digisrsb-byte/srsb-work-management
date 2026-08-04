@echo off
setlocal
cd /d "%~dp0"

echo.
echo ======================================================
echo  SRSB WORK MANAGEMENT 1.1.0 - BUILD APPLICATION
echo ======================================================
echo.
echo This builds the frontend and Windows installer.
echo Close SRSB Work Management before continuing.
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo ERROR: Node.js is not available in PATH.
  pause
  exit /b 1
)

if not exist "node_modules" (
  echo Installing dependencies...
  call npm install
  if errorlevel 1 (
    echo ERROR: Dependency installation failed.
    pause
    exit /b 1
  )
)

call npm run build:desktop
if errorlevel 1 (
  echo.
  echo ERROR: Application build failed. No installer should be shared.
  pause
  exit /b 1
)

if not exist "release\SRSB-Work-Management-Setup-1.1.0.exe" (
  echo.
  echo ERROR: Build finished but the expected installer was not found.
  pause
  exit /b 1
)

echo.
echo ======================================================
echo  APPLICATION CREATED SUCCESSFULLY
echo ======================================================
echo.
echo release\SRSB-Work-Management-Setup-1.1.0.exe
echo.
echo Test this installer before giving it to employees.
echo ======================================================
echo.
pause
endlocal
