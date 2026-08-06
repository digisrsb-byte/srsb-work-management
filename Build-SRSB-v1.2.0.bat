@echo off
setlocal
cd /d "%~dp0"

echo.
echo ======================================================
echo  SRSB WORK MANAGEMENT 1.2.0 - VALIDATE AND BUILD
echo ======================================================
echo.
echo Close SRSB Work Management before continuing.
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo ERROR: Node.js is not available in PATH.
  pause
  exit /b 1
)

where npm >nul 2>nul
if errorlevel 1 (
  echo ERROR: npm is not available in PATH.
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

echo.
echo Validating version 1.2.0 source...
call npm run validate:v120
if errorlevel 1 (
  echo ERROR: Version 1.2.0 validation failed. No installer was created.
  pause
  exit /b 1
)

echo.
echo Building frontend and Windows installer...
call npm run build:desktop
if errorlevel 1 (
  echo ERROR: Application build failed. No installer should be shared.
  pause
  exit /b 1
)

if not exist "release\SRSB-Work-Management-Setup-1.2.0.exe" (
  echo ERROR: Build finished but the expected installer was not found.
  pause
  exit /b 1
)

echo.
echo ======================================================
echo  SRSB WORK MANAGEMENT 1.2.0 CREATED SUCCESSFULLY
echo ======================================================
echo.
echo release\SRSB-Work-Management-Setup-1.2.0.exe
echo.
echo Do not share it until Railway verification and acceptance testing pass.
echo.
pause
endlocal
