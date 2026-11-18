@echo off
setlocal EnableExtensions
title NIMS Notebook Relay Bridge (Console)

set "BASE_DIR=%~dp0"
if "%BASE_DIR:~-1%"=="\" set "BASE_DIR=%BASE_DIR:~0,-1%"
set "NODE_EXE="
set "TRIED_WINGET="

echo.
echo ============================================================
echo   NIMS Notebook Relay Bridge - Console Runner
echo ============================================================
echo.

if exist "%BASE_DIR%\node.exe" set "NODE_EXE=%BASE_DIR%\node.exe"
if defined NODE_EXE goto :check_node_ver
for /f "delims=" %%i in ('where node 2^>nul') do if not defined NODE_EXE set "NODE_EXE=%%i"
if defined NODE_EXE goto :check_node_ver
if exist "%ProgramFiles%\nodejs\node.exe" set "NODE_EXE=%ProgramFiles%\nodejs\node.exe"
if defined NODE_EXE goto :check_node_ver
if exist "%LOCALAPPDATA%\Programs\nodejs\node.exe" set "NODE_EXE=%LOCALAPPDATA%\Programs\nodejs\node.exe"
if defined NODE_EXE goto :check_node_ver

:install_node
if defined TRIED_WINGET goto :no_node
set "TRIED_WINGET=1"
echo Node.js 18+ not found. Trying to install Node.js LTS via winget...
where winget >nul 2>&1
if errorlevel 1 goto :no_node
winget install -e --id OpenJS.NodeJS.LTS --silent --accept-package-agreements --accept-source-agreements
if exist "%ProgramFiles%\nodejs\node.exe" set "NODE_EXE=%ProgramFiles%\nodejs\node.exe"
if defined NODE_EXE goto :check_node_ver
for /f "delims=" %%i in ('where node 2^>nul') do if not defined NODE_EXE set "NODE_EXE=%%i"
if defined NODE_EXE goto :check_node_ver

:no_node
echo [ERROR] Node.js 18+ is required.
echo Please install Node.js LTS from https://nodejs.org or place node.exe in "%BASE_DIR%".
pause
exit /b 1

:check_node_ver
for /f "delims=" %%v in ('powershell -NoProfile -Command "try { ([version]((& $env:NODE_EXE -v).TrimStart('v'))).Major } catch { 0 }"') do set "NODE_MAJOR=%%v"
if "%NODE_MAJOR%"=="" set "NODE_MAJOR=0"
if %NODE_MAJOR% LSS 18 goto :install_node

if not exist "%BASE_DIR%\nims-relay-bridge.env" (
  if exist "%BASE_DIR%\nims-relay-bridge.env.example" (
    copy /Y "%BASE_DIR%\nims-relay-bridge.env.example" "%BASE_DIR%\nims-relay-bridge.env" >nul
  )
  echo [ACTION REQUIRED] Created "%BASE_DIR%\nims-relay-bridge.env"
  echo Please edit BRIDGE_SECRET and NIMS_AGENT_TOKENS inside nims-relay-bridge.env, then run this file again.
  notepad "%BASE_DIR%\nims-relay-bridge.env"
  exit /b 1
)

cd /d "%BASE_DIR%"
"%NODE_EXE%" "%BASE_DIR%\nims-relay-bridge.mjs"
pause
