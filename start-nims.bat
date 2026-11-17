@echo off
setlocal
cd /d "%~dp0"

echo ===============================================
echo  NIMS - Network Infrastructure Management
echo  Runtime: Node.js + MongoDB (No Docker)
echo ===============================================

if not exist ".env" (
  call npm run setup:db
  if errorlevel 1 exit /b 1
)

if "%1"=="start" (
  call npm run build && call npm run start
) else (
  call npm run dev
)
