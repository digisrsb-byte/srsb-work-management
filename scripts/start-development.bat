@echo off
start cmd /k "npm run dev:backend"
timeout /t 2 >nul
start cmd /k "npm run dev:frontend"
timeout /t 3 >nul
start cmd /k "npm run dev:desktop"
