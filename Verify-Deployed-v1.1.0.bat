@echo off
setlocal
cd /d "%~dp0"
echo.
echo ======================================================
echo  VERIFY EXISTING RAILWAY BACKEND - VERSION 1.1.0
echo ======================================================
echo.
node Verify-Deployed-v1.1.0.cjs
echo.
pause
endlocal
