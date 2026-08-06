@echo off
setlocal
cd /d "%~dp0"

echo.
echo ======================================================
echo  PUBLISH SRSB DESKTOP UPDATE
echo ======================================================
echo.
set /p VERSION=Enter new version (example 1.2.1): 

if "%VERSION%"=="" (
  echo Version is required.
  pause
  exit /b 1
)

node scripts\set-version.cjs "%VERSION%"
if errorlevel 1 (
  pause
  exit /b 1
)

call npm run validate:v120
if errorlevel 1 (
  echo Validation failed. Nothing will be published.
  pause
  exit /b 1
)

call npm run build:desktop
if errorlevel 1 (
  echo Build failed. Nothing will be published.
  pause
  exit /b 1
)

git add package.json package-lock.json apps .github scripts Build-SRSB-v1.2.0.bat Publish-Future-Update.bat README-V1.2.0.md
if errorlevel 1 goto :giterror

git commit -m "Release SRSB Work Management %VERSION%"
if errorlevel 1 goto :giterror

git tag "v%VERSION%"
if errorlevel 1 goto :giterror

git push origin main
if errorlevel 1 goto :giterror

git push origin "v%VERSION%"
if errorlevel 1 goto :giterror

echo.
echo Version %VERSION% was pushed.
echo GitHub Actions will create the installer release automatically.
echo Employees will see the update inside the application after release completion.
echo.
pause
exit /b 0

:giterror
echo.
echo Git command failed. Review the message above before retrying.
pause
exit /b 1
