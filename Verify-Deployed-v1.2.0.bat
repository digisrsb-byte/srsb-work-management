@echo off
setlocal
cd /d "%~dp0"
echo.
echo ======================================================
echo  VERIFY EXISTING RAILWAY BACKEND - VERSION 1.2.0
echo ======================================================
echo.
node Verify-Deployed-v1.2.0.cjs
echo.
pause
endlocal
