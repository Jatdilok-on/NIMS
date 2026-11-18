@echo off
setlocal EnableExtensions
title NIMS Notebook Relay Bridge - Background Auto-Start Installer

set "BASE_DIR=%~dp0"
if "%BASE_DIR:~-1%"=="\" set "BASE_DIR=%BASE_DIR:~0,-1%"
set "TASK_NAME=NIMS-Relay-Bridge"
set "NODE_EXE="
set "TRIED_WINGET="

echo.
echo ============================================================
echo   NIMS Notebook Relay Bridge - Background Auto-Start Setup
echo ============================================================
echo.

echo [1/4] Checking Node.js runtime...
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
echo [ERROR] Node.js 18+ is required and could not be auto-installed.
echo Please install Node.js LTS from https://nodejs.org or place node.exe in "%BASE_DIR%".
pause
exit /b 1

:check_node_ver
for /f "delims=" %%v in ('powershell -NoProfile -Command "try { ([version]((& $env:NODE_EXE -v).TrimStart('v'))).Major } catch { 0 }"') do set "NODE_MAJOR=%%v"
if "%NODE_MAJOR%"=="" set "NODE_MAJOR=0"
if %NODE_MAJOR% LSS 18 goto :install_node
echo       Using Node.js: "%NODE_EXE%" (v%NODE_MAJOR%+)

echo [2/4] Checking nims-relay-bridge.env...
if not exist "%BASE_DIR%\nims-relay-bridge.mjs" (
  echo [ERROR] nims-relay-bridge.mjs not found in "%BASE_DIR%"
  pause
  exit /b 1
)
if not exist "%BASE_DIR%\nims-relay-bridge.env" (
  if exist "%BASE_DIR%\nims-relay-bridge.env.example" (
    copy /Y "%BASE_DIR%\nims-relay-bridge.env.example" "%BASE_DIR%\nims-relay-bridge.env" >nul
  )
  echo [ACTION REQUIRED] Created "%BASE_DIR%\nims-relay-bridge.env".
  echo Please fill in BRIDGE_SECRET and NIMS_AGENT_TOKENS, save it, then run this installer again.
  notepad "%BASE_DIR%\nims-relay-bridge.env"
  exit /b 1
)

findstr /C:"CHANGE_ME_LONG_RANDOM_SECRET" /C:"paste_site1_token_here" "%BASE_DIR%\nims-relay-bridge.env" >nul 2>&1
if not errorlevel 1 (
  echo [ACTION REQUIRED] nims-relay-bridge.env still contains placeholder values!
  echo Please fill in your real BRIDGE_SECRET and NIMS_AGENT_TOKENS first, save, and run again.
  notepad "%BASE_DIR%\nims-relay-bridge.env"
  exit /b 1
)

echo [3/4] Stopping old bridge processes and creating background runner...
powershell -NoProfile -ExecutionPolicy Bypass -Command "Get-CimInstance Win32_Process | Where-Object { ($_.Name -eq 'cmd.exe' -and $_.CommandLine -like '*bridge-run.cmd*') -or ($_.Name -eq 'wscript.exe' -and $_.CommandLine -like '*bridge-hidden.vbs*') -or ($_.Name -eq 'node.exe' -and $_.CommandLine -like '*nims-relay-bridge.mjs*') } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }" >nul 2>&1

> "%BASE_DIR%\bridge-run.cmd" echo @echo off
>> "%BASE_DIR%\bridge-run.cmd" echo cd /d "%BASE_DIR%"
>> "%BASE_DIR%\bridge-run.cmd" echo :loop
>> "%BASE_DIR%\bridge-run.cmd" echo if not exist "%BASE_DIR%\nims-relay-bridge.mjs" exit /b 0
>> "%BASE_DIR%\bridge-run.cmd" echo if not exist "%BASE_DIR%\nims-relay-bridge.env" exit /b 0
>> "%BASE_DIR%\bridge-run.cmd" echo "%NODE_EXE%" "%BASE_DIR%\nims-relay-bridge.mjs" ^>^> "%BASE_DIR%\bridge.log" 2^>^&1
>> "%BASE_DIR%\bridge-run.cmd" echo timeout /t 5 /nobreak ^>nul
>> "%BASE_DIR%\bridge-run.cmd" echo goto loop

> "%BASE_DIR%\bridge-hidden.vbs" echo Set fso = CreateObject("Scripting.FileSystemObject")
>> "%BASE_DIR%\bridge-hidden.vbs" echo Set sh = CreateObject("WScript.Shell")
>> "%BASE_DIR%\bridge-hidden.vbs" echo d = fso.GetParentFolderName(WScript.ScriptFullName)
>> "%BASE_DIR%\bridge-hidden.vbs" echo sh.CurrentDirectory = d
>> "%BASE_DIR%\bridge-hidden.vbs" echo lf = d ^& "\bridge.log"
>> "%BASE_DIR%\bridge-hidden.vbs" echo If fso.FileExists(lf) Then If fso.GetFile(lf).Size ^> 2097152 Then fso.DeleteFile lf, True
>> "%BASE_DIR%\bridge-hidden.vbs" echo sh.Run "cmd /c " ^& Chr(34) ^& d ^& "\bridge-run.cmd" ^& Chr(34), 0, False

> "%BASE_DIR%\view-bridge-log.bat" echo @echo off
>> "%BASE_DIR%\view-bridge-log.bat" echo title NIMS Relay Bridge Log
>> "%BASE_DIR%\view-bridge-log.bat" echo powershell -NoProfile -Command "Get-Content -Path '%BASE_DIR%\bridge.log' -Tail 30 -Wait"

> "%BASE_DIR%\uninstall-bridge.bat" echo @echo off
>> "%BASE_DIR%\uninstall-bridge.bat" echo echo Stopping NIMS Relay Bridge and removing Auto-Start...
>> "%BASE_DIR%\uninstall-bridge.bat" echo schtasks /delete /tn "%TASK_NAME%" /f ^>nul 2^>^&1
>> "%BASE_DIR%\uninstall-bridge.bat" echo powershell -NoProfile -ExecutionPolicy Bypass -Command "Get-CimInstance Win32_Process | Where-Object { ($_.Name -eq 'cmd.exe' -and $_.CommandLine -like '*bridge-run.cmd*') -or ($_.Name -eq 'wscript.exe' -and $_.CommandLine -like '*bridge-hidden.vbs*') -or ($_.Name -eq 'node.exe' -and $_.CommandLine -like '*nims-relay-bridge.mjs*') } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }"
>> "%BASE_DIR%\uninstall-bridge.bat" echo del /f /q "%BASE_DIR%\bridge-run.cmd" "%BASE_DIR%\bridge-hidden.vbs" ^>nul 2^>^&1
>> "%BASE_DIR%\uninstall-bridge.bat" echo echo [OK] NIMS Relay Bridge stopped and auto-start removed.
>> "%BASE_DIR%\uninstall-bridge.bat" echo pause

echo [4/4] Registering auto-start task (%TASK_NAME%) and starting in background...
schtasks /create /tn "%TASK_NAME%" /tr "wscript.exe \"%BASE_DIR%\bridge-hidden.vbs\"" /sc ONSTART /ru SYSTEM /rl HIGHEST /f >nul 2>&1
if not errorlevel 1 goto :task_ready
schtasks /create /tn "%TASK_NAME%" /tr "wscript.exe \"%BASE_DIR%\bridge-hidden.vbs\"" /sc ONLOGON /f >nul 2>&1

:task_ready
wscript.exe "%BASE_DIR%\bridge-hidden.vbs"
timeout /t 2 /nobreak >nul

echo.
echo ============================================================
echo   [OK] NIMS Relay Bridge is now running in background!
echo   - Working folder  : %BASE_DIR%
echo   - Auto-start task : %TASK_NAME%
echo   - View live log   : "%BASE_DIR%\view-bridge-log.bat"
echo   - Stop / Remove   : "%BASE_DIR%\uninstall-bridge.bat"
echo   (Tip: Adding tokens to nims-relay-bridge.env auto-reloads in ~15s)
echo ============================================================
echo.
if exist "%BASE_DIR%\bridge.log" (
  echo --- Latest bridge.log ---
  powershell -NoProfile -Command "Get-Content -Path '%BASE_DIR%\bridge.log' -Tail 12"
)
echo.
pause
