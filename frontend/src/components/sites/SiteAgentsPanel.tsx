'use client';

import React, { useCallback, useEffect, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  Check,
  Copy,
  Download,
  Globe,
  KeyRound,
  Pencil,
  Plus,
  Power,
  Radio,
  RefreshCw,
  Terminal,
  Trash2,
  Wand2,
  X,
} from 'lucide-react';
import { ConfirmActionModal } from '@/components/common/ConfirmActionModal';
import { apiFetch, ApiError, copyTextSafe } from '@/lib/api';
import { AgentConnectionState, SiteAgent } from '@/lib/types';

const STATE_BADGE: Record<AgentConnectionState, { label: string; className: string; dot: string }> = {
  ONLINE: {
    label: 'ONLINE',
    className:
      'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800',
    dot: 'bg-emerald-500 animate-pulse',
  },
  OFFLINE: {
    label: 'OFFLINE',
    className:
      'bg-red-50 text-red-700 border-red-200 dark:bg-red-950/40 dark:text-red-300 dark:border-red-800',
    dot: 'bg-red-500',
  },
  NEVER_CONNECTED: {
    label: 'WAITING FOR AGENT',
    className:
      'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800',
    dot: 'bg-amber-500',
  },
  DISABLED: {
    label: 'DISABLED',
    className:
      'bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700',
    dot: 'bg-slate-400',
  },
};

function formatRelativeTime(iso?: string | null): string {
  if (!iso) return 'Never';
  const diffSec = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (diffSec < 10) return 'Just now';
  if (diffSec < 60) return `${diffSec}s ago`;
  const min = Math.floor(diffSec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  return `${Math.floor(hr / 24)}d ago`;
}

function buildAgentEnvText(
  serverUrl: string,
  token: string,
  allowInsecureTls = false,
): string {
  const cleanUrl = serverUrl.trim().replace(/\/+$/, '');
  return [
    `NIMS_URL=${cleanUrl}`,
    `NIMS_AGENT_TOKEN=${token}`,
    'NIMS_PING_TIMEOUT_MS=2000',
    'NIMS_CONCURRENCY=15',
    '# Optional: fallback TCP port checks when ICMP ping is blocked by firewall',
    'NIMS_FALLBACK_TCP_PORTS=22,80,443,3389,502,9100',
    `NIMS_ALLOW_INSECURE_TLS=${allowInsecureTls ? 'true' : 'false'}`,
    '',
  ].join('\n');
}

function sanitizeBatValue(value: string): string {
  return value.replace(/[\r\n"&|<>^%]/g, '').trim();
}

function encodeUtf8ToBase64(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

function buildBase64WriteLines(base64: string, b64Name: string, outName: string): string[] {
  return [
    ...Array.from({ length: Math.ceil(base64.length / 900) }, (_, idx) => {
      const chunk = base64.slice(idx * 900, (idx + 1) * 900);
      const op = idx === 0 ? '>' : '>>';
      return `${op} "%INSTALL_DIR%\\${b64Name}" echo ${chunk}`;
    }),
    `"%NODE_EXE%" -e "const fs=require('fs'),p=require('path');const b=p.join(process.env.INSTALL_DIR,'${b64Name}');fs.writeFileSync(p.join(process.env.INSTALL_DIR,'${outName}'),Buffer.from(fs.readFileSync(b,'utf8').replace(/\\s+/g,''),'base64'));fs.unlinkSync(b);"`,
  ];
}

function buildWindowsNodeCheckLines(): string[] {
  return [
    'for /f "delims=" %%i in (\'where node 2^>nul\') do if not defined NODE_EXE set "NODE_EXE=%%i"',
    'if defined NODE_EXE goto :check_node_ver',
    'if exist "%ProgramFiles%\\nodejs\\node.exe" set "NODE_EXE=%ProgramFiles%\\nodejs\\node.exe"',
    'if defined NODE_EXE goto :check_node_ver',
    'if exist "%LOCALAPPDATA%\\Programs\\nodejs\\node.exe" set "NODE_EXE=%LOCALAPPDATA%\\Programs\\nodejs\\node.exe"',
    'if defined NODE_EXE goto :check_node_ver',
    '',
    ':install_node',
    'if defined TRIED_WINGET goto :no_winget',
    'set "TRIED_WINGET=1"',
    'echo Node.js 18+ not found. Trying to install Node.js LTS via winget...',
    'where winget >nul 2>&1',
    'if errorlevel 1 goto :no_winget',
    'winget install -e --id OpenJS.NodeJS.LTS --silent --accept-package-agreements --accept-source-agreements',
    'if exist "%ProgramFiles%\\nodejs\\node.exe" set "NODE_EXE=%ProgramFiles%\\nodejs\\node.exe"',
    'if defined NODE_EXE goto :check_node_ver',
    'for /f "delims=" %%i in (\'where node 2^>nul\') do if not defined NODE_EXE set "NODE_EXE=%%i"',
    'if defined NODE_EXE goto :check_node_ver',
    '',
    ':no_winget',
    'echo [ERROR] Node.js 18+ is required and could not be auto-installed.',
    'echo Please install Node.js LTS from https://nodejs.org then run this file again.',
    'pause',
    'exit /b 1',
    '',
    ':check_node_ver',
    'for /f "delims=" %%v in (\'powershell -NoProfile -Command "try { ([version]((& $env:NODE_EXE -v).TrimStart(\'v\'))).Major } catch { 0 }"\') do set "NODE_MAJOR=%%v"',
    'if "%NODE_MAJOR%"=="" set "NODE_MAJOR=0"',
    'if %NODE_MAJOR% LSS 18 goto :install_node',
    'echo       Using Node.js: "%NODE_EXE%" (v%NODE_MAJOR%+)',
  ];
}

function buildBridgeEnvText(
  nimsUrl: string,
  relayUrl: string,
  bridgeSecret: string,
  token: string,
  allowInsecureTls = true,
): string {
  const cleanNims = nimsUrl.trim().replace(/\/+$/, '');
  const cleanRelay = relayUrl.trim().replace(/\/+$/, '');
  const cleanSecret = bridgeSecret.trim() || 'CHANGE_ME_LONG_RANDOM_SECRET';
  return [
    `NIMS_URL=${cleanNims}`,
    `NIMS_ALLOW_INSECURE_TLS=${allowInsecureTls ? 'true' : 'false'}`,
    `RELAY_URL=${cleanRelay}`,
    `BRIDGE_SECRET=${cleanSecret}`,
    `NIMS_AGENT_TOKENS=${token.trim()}`,
    'BRIDGE_POLL_SEC=15',
    'TARGETS_SYNC_SEC=120',
    '',
  ].join('\n');
}

function buildWindowsBridgeOneClickBat(
  nimsUrl: string,
  relayUrl: string,
  bridgeSecret: string,
  token: string,
  allowInsecureTls: boolean,
  embeddedBridgeBase64: string,
): string {
  const cleanNims = sanitizeBatValue(nimsUrl).replace(/\/+$/, '');
  const cleanRelay = sanitizeBatValue(relayUrl).replace(/\/+$/, '');
  const cleanSecret = sanitizeBatValue(bridgeSecret);
  const cleanToken = sanitizeBatValue(token);

  const lines = [
    '@echo off',
    'setlocal EnableExtensions',
    'title NIMS Notebook Relay Bridge - 1-Click Installer',
    'echo.',
    'echo ============================================================',
    'echo   NIMS Notebook Relay Bridge - 1-Click Auto Setup',
    'echo ============================================================',
    'echo.',
    `set "NIMS_URL=${cleanNims}"`,
    `set "NIMS_INSECURE=${allowInsecureTls ? 'true' : 'false'}"`,
    `set "RELAY_URL=${cleanRelay}"`,
    `set "BRIDGE_SECRET=${cleanSecret}"`,
    `set "NEW_TOKEN=${cleanToken}"`,
    'set "INSTALL_DIR=%LOCALAPPDATA%\\NIMS-Relay-Bridge"',
    'set "TASK_NAME=NIMS-Relay-Bridge"',
    'set "NODE_EXE="',
    'set "TRIED_WINGET="',
    '',
    'echo [1/4] Checking Node.js runtime...',
    ...buildWindowsNodeCheckLines(),
    '',
    'echo [2/4] Preparing "%INSTALL_DIR%" and writing nims-relay-bridge.mjs...',
    'if not exist "%INSTALL_DIR%" mkdir "%INSTALL_DIR%"',
    'powershell -NoProfile -ExecutionPolicy Bypass -Command "Get-CimInstance Win32_Process | Where-Object { ($_.Name -eq \'cmd.exe\' -and $_.CommandLine -like \'*bridge-run.cmd*\') -or ($_.Name -eq \'wscript.exe\' -and $_.CommandLine -like \'*bridge-hidden.vbs*\') -or ($_.Name -eq \'node.exe\' -and $_.CommandLine -like \'*nims-relay-bridge.mjs*\') } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }" >nul 2>&1',
    ...buildBase64WriteLines(embeddedBridgeBase64, 'bridge.b64', 'nims-relay-bridge.mjs'),
    '',
    'echo [3/4] Updating nims-relay-bridge.env (merging site token)...',
    '"%NODE_EXE%" -e "const fs=require(\'fs\'),p=require(\'path\');const envPath=p.join(process.env.INSTALL_DIR,\'nims-relay-bridge.env\');const kv={NIMS_URL:process.env.NIMS_URL,NIMS_ALLOW_INSECURE_TLS:process.env.NIMS_INSECURE,RELAY_URL:process.env.RELAY_URL,BRIDGE_SECRET:process.env.BRIDGE_SECRET||\'CHANGE_ME_LONG_RANDOM_SECRET\',NIMS_AGENT_TOKENS:\'\',BRIDGE_POLL_SEC:\'15\',TARGETS_SYNC_SEC:\'120\'};if(fs.existsSync(envPath)){for(const raw of fs.readFileSync(envPath,\'utf8\').split(/\\r?\\n/)){const l=raw.trim();if(!l||l.startsWith(\'#\'))continue;const i=l.indexOf(\'=\');if(i>0){const k=l.slice(0,i).trim(),v=l.slice(i+1).trim();if(k===\'BRIDGE_SECRET\'&&!process.env.BRIDGE_SECRET&&v)kv[k]=v;else if(k!==\'NIMS_URL\'&&k!==\'RELAY_URL\'&&k!==\'NIMS_ALLOW_INSECURE_TLS\'&&k!==\'BRIDGE_SECRET\')kv[k]=v;}}}const tokens=new Set((kv.NIMS_AGENT_TOKENS||\'\').split(/[\\r\\n,]+/).map(s=>s.trim()).filter(Boolean));if(process.env.NEW_TOKEN)tokens.add(process.env.NEW_TOKEN);kv.NIMS_AGENT_TOKENS=Array.from(tokens).join(\',\');const out=Object.entries(kv).map(([k,v])=>k+\'=\'+v).join(\'\\n\')+\'\\n\';fs.writeFileSync(envPath,out,\'utf8\');console.log(\'       Active tokens in bridge:\',tokens.size);"',
    '',
    'findstr /C:"CHANGE_ME_LONG_RANDOM_SECRET" "%INSTALL_DIR%\\nims-relay-bridge.env" >nul 2>&1',
    'if not errorlevel 1 (',
    '  echo [ACTION REQUIRED] Please replace BRIDGE_SECRET in nims-relay-bridge.env, save, and re-run this file.',
    '  notepad "%INSTALL_DIR%\\nims-relay-bridge.env"',
    '  exit /b 1',
    ')',
    '',
    '> "%INSTALL_DIR%\\bridge-run.cmd" echo @echo off',
    '>> "%INSTALL_DIR%\\bridge-run.cmd" echo cd /d "%INSTALL_DIR%"',
    '>> "%INSTALL_DIR%\\bridge-run.cmd" echo :loop',
    '>> "%INSTALL_DIR%\\bridge-run.cmd" echo if not exist "%INSTALL_DIR%\\nims-relay-bridge.mjs" exit /b 0',
    '>> "%INSTALL_DIR%\\bridge-run.cmd" echo if not exist "%INSTALL_DIR%\\nims-relay-bridge.env" exit /b 0',
    '>> "%INSTALL_DIR%\\bridge-run.cmd" echo "%NODE_EXE%" "%INSTALL_DIR%\\nims-relay-bridge.mjs" ^>^> "%INSTALL_DIR%\\bridge.log" 2^>^&1',
    '>> "%INSTALL_DIR%\\bridge-run.cmd" echo timeout /t 5 /nobreak ^>nul',
    '>> "%INSTALL_DIR%\\bridge-run.cmd" echo goto loop',
    '',
    '> "%INSTALL_DIR%\\bridge-hidden.vbs" echo Set fso = CreateObject("Scripting.FileSystemObject")',
    '>> "%INSTALL_DIR%\\bridge-hidden.vbs" echo Set sh = CreateObject("WScript.Shell")',
    '>> "%INSTALL_DIR%\\bridge-hidden.vbs" echo d = fso.GetParentFolderName(WScript.ScriptFullName)',
    '>> "%INSTALL_DIR%\\bridge-hidden.vbs" echo sh.CurrentDirectory = d',
    '>> "%INSTALL_DIR%\\bridge-hidden.vbs" echo lf = d ^& "\\bridge.log"',
    '>> "%INSTALL_DIR%\\bridge-hidden.vbs" echo If fso.FileExists(lf) Then If fso.GetFile(lf).Size ^> 2097152 Then fso.DeleteFile lf, True',
    '>> "%INSTALL_DIR%\\bridge-hidden.vbs" echo sh.Run "cmd /c " ^& Chr(34) ^& d ^& "\\bridge-run.cmd" ^& Chr(34), 0, False',
    '',
    '> "%INSTALL_DIR%\\view-bridge-log.bat" echo @echo off',
    '>> "%INSTALL_DIR%\\view-bridge-log.bat" echo title NIMS Relay Bridge Log',
    '>> "%INSTALL_DIR%\\view-bridge-log.bat" echo powershell -NoProfile -Command "Get-Content -Path \'%INSTALL_DIR%\\bridge.log\' -Tail 30 -Wait"',
    '',
    '> "%INSTALL_DIR%\\uninstall-bridge.bat" echo @echo off',
    '>> "%INSTALL_DIR%\\uninstall-bridge.bat" echo schtasks /delete /tn "%TASK_NAME%" /f ^>nul 2^>^&1',
    '>> "%INSTALL_DIR%\\uninstall-bridge.bat" echo powershell -NoProfile -ExecutionPolicy Bypass -Command "Get-CimInstance Win32_Process | Where-Object { ($_.Name -eq \'cmd.exe\' -and $_.CommandLine -like \'*bridge-run.cmd*\') -or ($_.Name -eq \'wscript.exe\' -and $_.CommandLine -like \'*bridge-hidden.vbs*\') -or ($_.Name -eq \'node.exe\' -and $_.CommandLine -like \'*nims-relay-bridge.mjs*\') } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }"',
    '>> "%INSTALL_DIR%\\uninstall-bridge.bat" echo cd /d "%%TEMP%%"',
    '>> "%INSTALL_DIR%\\uninstall-bridge.bat" echo start "" /min powershell -NoProfile -WindowStyle Hidden -Command "Start-Sleep 2; Remove-Item -LiteralPath \'%INSTALL_DIR%\' -Recurse -Force -ErrorAction SilentlyContinue"',
    '>> "%INSTALL_DIR%\\uninstall-bridge.bat" echo echo [OK] NIMS Relay Bridge stopped and removed.',
    '>> "%INSTALL_DIR%\\uninstall-bridge.bat" echo pause',
    '',
    'echo [4/4] Registering auto-start task (%TASK_NAME%) and starting in background...',
    'schtasks /create /tn "%TASK_NAME%" /tr "wscript.exe \\"%INSTALL_DIR%\\bridge-hidden.vbs\\"" /sc ONSTART /ru SYSTEM /rl HIGHEST /f >nul 2>&1',
    'if not errorlevel 1 goto :task_ready',
    'schtasks /create /tn "%TASK_NAME%" /tr "wscript.exe \\"%INSTALL_DIR%\\bridge-hidden.vbs\\"" /sc ONLOGON /f >nul 2>&1',
    ':task_ready',
    'wscript.exe "%INSTALL_DIR%\\bridge-hidden.vbs"',
    'timeout /t 2 /nobreak >nul',
    'echo.',
    'echo ============================================================',
    'echo   [OK] NIMS Relay Bridge is running silently in background!',
    'echo   - Install folder  : %INSTALL_DIR%',
    'echo   - View live log   : "%INSTALL_DIR%\\view-bridge-log.bat"',
    'echo   - Uninstall       : "%INSTALL_DIR%\\uninstall-bridge.bat"',
    'echo ============================================================',
    'echo.',
    'if exist "%INSTALL_DIR%\\bridge.log" powershell -NoProfile -Command "Get-Content -Path \'%INSTALL_DIR%\\bridge.log\' -Tail 10"',
    'pause',
    '',
  ];

  return lines.join('\r\n');
}

function buildWindowsOneClickBat(
  siteCode: string,
  agentName: string,
  serverUrl: string,
  token: string,
  allowInsecureTls = false,
  embeddedScriptBase64?: string,
): string {
  const cleanUrl = sanitizeBatValue(serverUrl).replace(/\/+$/, '');
  const cleanToken = sanitizeBatValue(token);
  const safeSite = siteCode.replace(/[^a-zA-Z0-9_-]/g, '') || 'SITE';
  const suffix = cleanToken.replace(/^nims_agt_/, '').slice(0, 6) || 'agent';
  const folderName = `${safeSite}-${suffix}`;
  const taskName = `NIMS-SiteAgent-${folderName}`;
  const safeAgentName = sanitizeBatValue(agentName) || safeSite;
  const scriptWriteLines = embeddedScriptBase64
    ? buildBase64WriteLines(embeddedScriptBase64, 'nims-agent.b64', 'nims-agent.mjs')
    : [
        ...(allowInsecureTls ? ['set "NODE_TLS_REJECT_UNAUTHORIZED=0"'] : []),
        '"%NODE_EXE%" -e "fetch(process.env.NIMS_URL+\'/api/agents/runtime/script\',{headers:{Authorization:\'Bearer \'+process.env.AGENT_TOKEN}}).then(async r=>{if(!r.ok)throw new Error(\'HTTP \'+r.status);require(\'fs\').writeFileSync(require(\'path\').join(process.env.INSTALL_DIR,\'nims-agent.mjs\'),await r.text());}).catch(e=>{console.error(e.message||e);process.exit(1);})"',
      ];

  const lines = [
    '@echo off',
    'setlocal EnableExtensions',
    `title NIMS Site Ping Agent - 1-Click Installer (${safeSite})`,
    'echo.',
    'echo ============================================================',
    `echo   NIMS Site Ping Agent - 1-Click Auto Setup (${safeSite})`,
    `echo   Agent: ${safeAgentName}`,
    'echo ============================================================',
    'echo.',
    `set "SITE_CODE=${safeSite}"`,
    `set "NIMS_URL=${cleanUrl}"`,
    `set "AGENT_TOKEN=${cleanToken}"`,
    `set "INSTALL_DIR=%LOCALAPPDATA%\\NIMS-Agent\\${folderName}"`,
    `set "TASK_NAME=${taskName}"`,
    'set "NODE_EXE="',
    'set "TRIED_WINGET="',
    '',
    'echo [1/5] Checking Node.js runtime...',
    ...buildWindowsNodeCheckLines(),
    '',
    'echo [2/5] Preparing folder "%INSTALL_DIR%"...',
    'if not exist "%INSTALL_DIR%" mkdir "%INSTALL_DIR%"',
    'powershell -NoProfile -ExecutionPolicy Bypass -Command "Get-CimInstance Win32_Process | Where-Object { ($_.Name -eq \'cmd.exe\' -and $_.CommandLine -like (\'*\' + $env:INSTALL_DIR + \'*node-run.cmd*\')) -or ($_.Name -eq \'wscript.exe\' -and $_.CommandLine -like (\'*\' + $env:INSTALL_DIR + \'*run-hidden.vbs*\')) -or ($_.Name -eq \'node.exe\' -and $_.CommandLine -like (\'*\' + $env:INSTALL_DIR + \'*nims-agent.mjs*\')) } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }" >nul 2>&1',
    '',
    'echo [3/5] Writing config and downloading latest nims-agent.mjs...',
    'echo NIMS_URL=%NIMS_URL%> "%INSTALL_DIR%\\nims-agent.env"',
    'echo NIMS_AGENT_TOKEN=%AGENT_TOKEN%>> "%INSTALL_DIR%\\nims-agent.env"',
    'echo NIMS_PING_TIMEOUT_MS=2000>> "%INSTALL_DIR%\\nims-agent.env"',
    'echo NIMS_CONCURRENCY=15 >> "%INSTALL_DIR%\\nims-agent.env"',
    'echo NIMS_FALLBACK_TCP_PORTS=22,80,443,3389,502,9100 >> "%INSTALL_DIR%\\nims-agent.env"',
    `echo NIMS_ALLOW_INSECURE_TLS=${allowInsecureTls ? 'true' : 'false'}>> "%INSTALL_DIR%\\nims-agent.env"`,
    '',
    ...scriptWriteLines,
    'if not errorlevel 1 goto :script_ok',
    'echo.',
    'echo [ERROR] Could not download agent script from %NIMS_URL%',
    'echo Check that NIMS Server is running and reachable from this PC.',
    'pause',
    'exit /b 1',
    '',
    ':script_ok',
    'echo @echo off > "%INSTALL_DIR%\\node-run.cmd"',
    'echo cd /d "%INSTALL_DIR%" >> "%INSTALL_DIR%\\node-run.cmd"',
    'echo :loop >> "%INSTALL_DIR%\\node-run.cmd"',
    'echo if not exist "%INSTALL_DIR%\\nims-agent.mjs" exit /b 0 >> "%INSTALL_DIR%\\node-run.cmd"',
    'echo if not exist "%INSTALL_DIR%\\nims-agent.env" exit /b 0 >> "%INSTALL_DIR%\\node-run.cmd"',
    'echo "%NODE_EXE%" "%INSTALL_DIR%\\nims-agent.mjs" ^>^> "%INSTALL_DIR%\\agent.log" 2^>^&1 >> "%INSTALL_DIR%\\node-run.cmd"',
    'echo if %%ERRORLEVEL%% EQU 42 exit /b 0 >> "%INSTALL_DIR%\\node-run.cmd"',
    'echo timeout /t 10 /nobreak ^>nul >> "%INSTALL_DIR%\\node-run.cmd"',
    'echo goto loop >> "%INSTALL_DIR%\\node-run.cmd"',
    '',
    'echo Set fso = CreateObject("Scripting.FileSystemObject") > "%INSTALL_DIR%\\run-hidden.vbs"',
    'echo Set sh = CreateObject("WScript.Shell") >> "%INSTALL_DIR%\\run-hidden.vbs"',
    'echo d = fso.GetParentFolderName(WScript.ScriptFullName) >> "%INSTALL_DIR%\\run-hidden.vbs"',
    'echo sh.CurrentDirectory = d >> "%INSTALL_DIR%\\run-hidden.vbs"',
    'echo lf = d ^& "\\agent.log" >> "%INSTALL_DIR%\\run-hidden.vbs"',
    'echo If fso.FileExists(lf) Then If fso.GetFile(lf).Size ^> 2097152 Then fso.DeleteFile lf, True >> "%INSTALL_DIR%\\run-hidden.vbs"',
    'echo sh.Run "cmd /c " ^& Chr(34) ^& d ^& "\\node-run.cmd" ^& Chr(34), 0, False >> "%INSTALL_DIR%\\run-hidden.vbs"',
    '',
    'echo @echo off > "%INSTALL_DIR%\\view-log.bat"',
    'echo powershell -NoProfile -Command "Get-Content -Path \'%INSTALL_DIR%\\agent.log\' -Tail 30" >> "%INSTALL_DIR%\\view-log.bat"',
    'echo pause >> "%INSTALL_DIR%\\view-log.bat"',
    '',
    'echo @echo off > "%INSTALL_DIR%\\uninstall-agent.bat"',
    'echo echo Stopping NIMS Agent and removing Auto-Start... >> "%INSTALL_DIR%\\uninstall-agent.bat"',
    'echo schtasks /delete /tn "%TASK_NAME%" /f ^>nul 2^>^&1 >> "%INSTALL_DIR%\\uninstall-agent.bat"',
    'echo powershell -NoProfile -ExecutionPolicy Bypass -Command "Get-CimInstance Win32_Process | Where-Object { ($_.Name -eq \'cmd.exe\' -and $_.CommandLine -like \'*%INSTALL_DIR%*node-run.cmd*\') -or ($_.Name -eq \'wscript.exe\' -and $_.CommandLine -like \'*%INSTALL_DIR%*run-hidden.vbs*\') -or ($_.Name -eq \'node.exe\' -and $_.CommandLine -like \'*%INSTALL_DIR%*nims-agent.mjs*\') } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }" >> "%INSTALL_DIR%\\uninstall-agent.bat"',
    'echo cd /d "%%TEMP%%" >> "%INSTALL_DIR%\\uninstall-agent.bat"',
    'echo start "" /min powershell -NoProfile -WindowStyle Hidden -Command "Start-Sleep 2; Remove-Item -LiteralPath \'%INSTALL_DIR%\' -Recurse -Force -ErrorAction SilentlyContinue" >> "%INSTALL_DIR%\\uninstall-agent.bat"',
    'echo echo NIMS Site Agent stopped, auto-start removed, and folder scheduled for cleanup. >> "%INSTALL_DIR%\\uninstall-agent.bat"',
    'echo pause >> "%INSTALL_DIR%\\uninstall-agent.bat"',
    '',
    'echo [4/5] Running quick connection ^& ping test (--once)...',
    '"%NODE_EXE%" "%INSTALL_DIR%\\nims-agent.mjs" --once',
    'if errorlevel 1 echo [WARN] Initial test reported an error. Auto-start will still retry automatically.',
    '',
    'echo [5/5] Registering background auto-start and starting agent...',
    'schtasks /create /tn "%TASK_NAME%" /tr "wscript.exe \\"%INSTALL_DIR%\\run-hidden.vbs\\"" /sc ONSTART /ru SYSTEM /rl HIGHEST /f >nul 2>&1',
    'if not errorlevel 1 goto :task_ready',
    'schtasks /create /tn "%TASK_NAME%" /tr "wscript.exe \\"%INSTALL_DIR%\\run-hidden.vbs\\"" /sc ONLOGON /f >nul 2>&1',
    ':task_ready',
    'wscript.exe "%INSTALL_DIR%\\run-hidden.vbs"',
    '',
    'echo.',
    'echo ============================================================',
    'echo   [OK] NIMS Site Agent is now running silently in background!',
    'echo   - Auto-start task : %TASK_NAME%',
    'echo   - Install folder  : %INSTALL_DIR%',
    'echo   - Check log       : "%INSTALL_DIR%\\view-log.bat"',
    'echo   - Uninstall       : "%INSTALL_DIR%\\uninstall-agent.bat"',
    'echo ============================================================',
    'echo.',
    'pause',
    '',
  ];

  return lines.join('\r\n');
}

function downloadTextFile(filename: string, content: string) {
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function SiteAgentsPanel({
  siteId,
  siteCode,
  canManage = false,
}: {
  siteId: string;
  siteCode: string;
  canManage?: boolean;
}) {
  const [agents, setAgents] = useState<SiteAgent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editingAgent, setEditingAgent] = useState<SiteAgent | null>(null);
  const [tokenReveal, setTokenReveal] = useState<{
    agentName: string;
    rawToken: string;
    mode: 'LAN' | 'REMOTE';
  } | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [downloadingRemoteBat, setDownloadingRemoteBat] = useState(false);
  const [downloadingBridgeBat, setDownloadingBridgeBat] = useState(false);

  const [rotateTarget, setRotateTarget] = useState<SiteAgent | null>(null);
  const [rotating, setRotating] = useState(false);
  const [rotateError, setRotateError] = useState<string | null>(null);

  const [deleteTarget, setDeleteTarget] = useState<SiteAgent | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const [savedRelayUrl, setSavedRelayUrl] = useState(() => {
    if (typeof window !== 'undefined') {
      return window.localStorage.getItem('nims_relay_url') || 'https://nims-relay.jatdilok-on.workers.dev';
    }
    return 'https://nims-relay.jatdilok-on.workers.dev';
  });
  const [savedBridgeSecret, setSavedBridgeSecret] = useState(() => {
    if (typeof window !== 'undefined') {
      return window.localStorage.getItem('nims_bridge_secret') || '';
    }
    return '';
  });
  const [nimsServerUrl, setNimsServerUrl] = useState(() =>
    typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000',
  );
  const [allowInsecureTls, setAllowInsecureTls] = useState(() =>
    typeof window !== 'undefined' ? window.location.protocol === 'https:' : false,
  );
  const isLocalhostUrl = /\/\/(localhost|127\.0\.0\.1)(:|\/|$)/i.test(nimsServerUrl);

  const updateRelayUrl = (nextUrl: string) => {
    setSavedRelayUrl(nextUrl);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem('nims_relay_url', nextUrl);
    }
  };

  const updateBridgeSecret = (nextSecret: string) => {
    setSavedBridgeSecret(nextSecret);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem('nims_bridge_secret', nextSecret);
    }
  };

  const handleDownloadBridgeBat = async () => {
    if (!tokenReveal) return;
    if (!savedRelayUrl.trim() || !nimsServerUrl.trim()) {
      setError('กรุณากรอก NIMS Server URL และ Cloudflare Relay URL ก่อนดาวน์โหลด');
      return;
    }
    setDownloadingBridgeBat(true);
    setError(null);
    try {
      const res = await fetch('/api/agents/relay-script', { credentials: 'include' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const scriptText = await res.text();
      const base64 = encodeUtf8ToBase64(scriptText);
      downloadTextFile(
        'nims-relay-bridge-1click.bat',
        buildWindowsBridgeOneClickBat(
          nimsServerUrl,
          savedRelayUrl,
          savedBridgeSecret,
          tokenReveal.rawToken,
          allowInsecureTls,
          base64,
        ),
      );
    } catch (err) {
      setError(
        err instanceof Error
          ? `ไม่สามารถดึงไฟล์ nims-relay-bridge.mjs จาก Server ได้: ${err.message}`
          : 'ไม่สามารถสร้างไฟล์ Bridge 1-Click Installer ได้',
      );
    } finally {
      setDownloadingBridgeBat(false);
    }
  };

  const handleDownloadOneClickBat = async () => {
    if (!tokenReveal) return;
    const isRemote = tokenReveal.mode === 'REMOTE';
    const targetUrl = isRemote ? savedRelayUrl.trim() : nimsServerUrl.trim();
    if (!targetUrl) {
      setError(isRemote ? 'กรุณากรอก Relay URL ก่อนดาวน์โหลด' : 'กรุณากรอก NIMS Server URL ก่อนดาวน์โหลด');
      return;
    }
    const safeFileSite = siteCode.toLowerCase().replace(/[^a-z0-9_-]/g, '') || 'site';
    if (!isRemote) {
      downloadTextFile(
        `nims-agent-${safeFileSite}-1click.bat`,
        buildWindowsOneClickBat(
          siteCode,
          tokenReveal.agentName,
          targetUrl,
          tokenReveal.rawToken,
          allowInsecureTls,
        ),
      );
      return;
    }

    setDownloadingRemoteBat(true);
    setError(null);
    try {
      const res = await fetch('/api/agents/script', { credentials: 'include' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const scriptText = await res.text();
      const base64 = encodeUtf8ToBase64(scriptText);
      downloadTextFile(
        `nims-agent-${safeFileSite}-remote-1click.bat`,
        buildWindowsOneClickBat(
          siteCode,
          tokenReveal.agentName,
          targetUrl,
          tokenReveal.rawToken,
          false,
          base64,
        ),
      );
    } catch (err) {
      setError(
        err instanceof Error
          ? `ไม่สามารถดึงไฟล์ nims-agent.mjs จาก Server ได้: ${err.message}`
          : 'ไม่สามารถสร้างไฟล์ Remote 1-Click Installer ได้',
      );
    } finally {
      setDownloadingRemoteBat(false);
    }
  };

  const loadAgents = useCallback(async () => {
    try {
      const res = await apiFetch<{ agents: SiteAgent[] }>(`/agents?siteId=${siteId}`);
      setAgents(res.agents);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load site agents');
    } finally {
      setLoading(false);
    }
  }, [siteId]);

  useEffect(() => {
    loadAgents();
    const timer = setInterval(() => {
      loadAgents().catch(() => {});
    }, 30000);
    return () => clearInterval(timer);
  }, [loadAgents]);

  const copyText = async (key: string, text: string) => {
    try {
      await copyTextSafe(text);
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(null), 2000);
    } catch {
      // ignore clipboard errors
    }
  };

  const toggleActive = async (agent: SiteAgent) => {
    try {
      await apiFetch(`/agents/${agent.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ isActive: !agent.isActive }),
      });
      loadAgents();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to update agent');
    }
  };

  const confirmRotateToken = async () => {
    if (!rotateTarget) return;
    setRotating(true);
    setRotateError(null);
    try {
      const res = await apiFetch<{ agent: SiteAgent; rawToken: string }>(
        `/agents/${rotateTarget.id}/rotate-token`,
        { method: 'POST' },
      );
      setRotateTarget(null);
      setTokenReveal({ agentName: res.agent.name, rawToken: res.rawToken, mode: 'LAN' });
      loadAgents();
    } catch (err) {
      setRotateError(err instanceof ApiError ? err.message : 'Failed to rotate token');
    } finally {
      setRotating(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      await apiFetch(`/agents/${deleteTarget.id}`, { method: 'DELETE' });
      setDeleteTarget(null);
      loadAgents();
    } catch (err) {
      setDeleteError(err instanceof ApiError ? err.message : 'Failed to delete site agent');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold flex items-center gap-2">
            <Radio className="h-5 w-5 text-blue-600" />
            Site Ping Agents ({siteCode})
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Deploy a zero-dependency Node.js probe inside this site&apos;s LAN to ping devices and report UP/DOWN status automatically.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() =>
              copyText(
                'cleanup',
                'Get-ScheduledTask -TaskName "NIMS-SiteAgent-*" -ErrorAction SilentlyContinue | Unregister-ScheduledTask -Confirm:$false; Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -match "nims-agent\\.mjs|node-run\\.cmd|run-hidden\\.vbs" } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }; Remove-Item "$env:LOCALAPPDATA\\NIMS-Agent" -Recurse -Force -ErrorAction SilentlyContinue',
              )
            }
            title="Copy PowerShell command to stop and remove all local agent processes on the agent PC"
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-red-200 dark:border-red-900/60 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 text-xs font-medium cursor-pointer"
          >
            {copiedKey === 'cleanup' ? <Check className="h-3.5 w-3.5" /> : <Trash2 className="h-3.5 w-3.5" />}
            {copiedKey === 'cleanup' ? 'Copied Cleanup Cmd' : 'Copy Uninstall Cmd'}
          </button>
          <button
            type="button"
            onClick={() => loadAgents()}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-medium cursor-pointer"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Refresh
          </button>
          <a
            href="/api/agents/script"
            download="nims-agent.mjs"
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-medium"
          >
            <Download className="h-3.5 w-3.5 text-blue-600" />
            Download nims-agent.mjs
          </a>
          {canManage && (
            <button
              type="button"
              onClick={() => {
                setEditingAgent(null);
                setShowForm(true);
              }}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold cursor-pointer"
            >
              <Plus className="h-4 w-4" />
              Add Site Agent
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/40 px-4 py-2.5 text-xs text-red-700 dark:text-red-300">
          {error}
        </div>
      )}

      {/* One-time Token & Quick-Start Banner */}
      {tokenReveal && (
        <div className="rounded-xl border border-emerald-300 dark:border-emerald-800 bg-emerald-50/70 dark:bg-emerald-950/30 p-5 space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="font-bold text-sm text-emerald-900 dark:text-emerald-200 flex items-center gap-2">
                <KeyRound className="h-4 w-4" />
                Agent Token Generated — {tokenReveal.agentName}
              </h3>
              <p className="text-xs text-emerald-800 dark:text-emerald-300 mt-0.5">
                Copy or download this configuration now. For security, the full token cannot be viewed again after closing this panel.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setTokenReveal(null)}
              className="p-1 rounded hover:bg-emerald-200/50 dark:hover:bg-emerald-900/60 text-emerald-800 dark:text-emerald-200 cursor-pointer"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-2 rounded-lg bg-white dark:bg-slate-900 border border-emerald-200 dark:border-emerald-800 px-3 py-2 font-mono text-xs">
            <span className="flex-1 break-all select-all">{tokenReveal.rawToken}</span>
            <button
              type="button"
              onClick={() => copyText('token', tokenReveal.rawToken)}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-emerald-600 hover:bg-emerald-700 text-white font-sans font-semibold cursor-pointer"
            >
              {copiedKey === 'token' ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
              {copiedKey === 'token' ? 'Copied' : 'Copy Token'}
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() =>
                setTokenReveal((prev) => (prev ? { ...prev, mode: 'LAN' } : prev))
              }
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition cursor-pointer ${
                tokenReveal.mode === 'LAN'
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border-emerald-200 dark:border-emerald-800'
              }`}
            >
              Same LAN (วงเดียวกับ Server)
            </button>
            <button
              type="button"
              onClick={() =>
                setTokenReveal((prev) => (prev ? { ...prev, mode: 'REMOTE' } : prev))
              }
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition cursor-pointer ${
                tokenReveal.mode === 'REMOTE'
                  ? 'bg-emerald-600 text-white border-emerald-600'
                  : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border-emerald-200 dark:border-emerald-800'
              }`}
            >
              <Globe className="h-3.5 w-3.5" />
              Cross-Network / Relay (คนละวงเน็ต)
            </button>
          </div>

          {tokenReveal.mode === 'REMOTE' ? (
            <div className="space-y-2.5">
              <div className="rounded-lg bg-white dark:bg-slate-900 border border-emerald-200 dark:border-emerald-800 p-3 space-y-2">
                <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-300">
                  Cloudflare Relay URL (URL ที่เครื่อง Site ปลายทางส่งผลกลับมา)
                </label>
                <input
                  type="text"
                  value={savedRelayUrl}
                  onChange={(e) => updateRelayUrl(e.target.value)}
                  placeholder="https://nims-relay.xxx.workers.dev"
                  className="w-full px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-transparent font-mono text-xs"
                />
              </div>

              <div className="rounded-lg bg-sky-50/90 dark:bg-sky-950/40 border border-sky-200 dark:border-sky-800 p-3.5 space-y-2.5 text-xs text-sky-900 dark:text-sky-200">
                <div className="font-bold">
                  1) เครื่องกลาง (Notebook Bridge): กดโหลดไปรันหรืออัปเดต Token เข้าเครื่องกลาง
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[10px] font-semibold opacity-80 mb-1">
                      NIMS Server URL (วง LAN)
                    </label>
                    <input
                      type="text"
                      value={nimsServerUrl}
                      onChange={(e) => setNimsServerUrl(e.target.value)}
                      placeholder="https://191.20.110.191:3000"
                      className="w-full px-2.5 py-1.5 rounded border border-sky-300 dark:border-sky-700 bg-white/80 dark:bg-slate-900 font-mono text-[11px]"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-semibold opacity-80 mb-1">
                      BRIDGE_SECRET (จาก Cloudflare)
                    </label>
                    <input
                      type="text"
                      value={savedBridgeSecret}
                      onChange={(e) => updateBridgeSecret(e.target.value)}
                      placeholder="เว้นว่างได้ถ้าเครื่องกลางเคยตั้งไว้แล้ว"
                      className="w-full px-2.5 py-1.5 rounded border border-sky-300 dark:border-sky-700 bg-white/80 dark:bg-slate-900 font-mono text-[11px]"
                    />
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2 pt-0.5">
                  <button
                    type="button"
                    disabled={downloadingBridgeBat}
                    onClick={handleDownloadBridgeBat}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-xs cursor-pointer disabled:opacity-60"
                  >
                    <Download className="h-3.5 w-3.5" />
                    {downloadingBridgeBat
                      ? 'Preparing Bridge Installer...'
                      : '1) Download Bridge 1-Click (.bat) — เครื่องกลาง'}
                  </button>
                  <a
                    href="/api/agents/relay-script"
                    download="nims-relay-bridge.mjs"
                    className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-white dark:bg-slate-900 border border-sky-200 dark:border-sky-700 text-[11px] font-medium hover:bg-sky-50 dark:hover:bg-slate-800"
                  >
                    <Download className="h-3 w-3 text-blue-600" />
                    nims-relay-bridge.mjs
                  </a>
                  <button
                    type="button"
                    onClick={() =>
                      downloadTextFile(
                        'nims-relay-bridge.env',
                        buildBridgeEnvText(
                          nimsServerUrl,
                          savedRelayUrl,
                          savedBridgeSecret,
                          tokenReveal.rawToken,
                          allowInsecureTls,
                        ),
                      )
                    }
                    className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-white dark:bg-slate-900 border border-sky-200 dark:border-sky-700 text-[11px] font-medium hover:bg-sky-50 dark:hover:bg-slate-800 cursor-pointer"
                  >
                    <Download className="h-3 w-3 text-sky-600" />
                    nims-relay-bridge.env
                  </button>
                </div>
                <p className="text-[11px] opacity-90">
                  ดับเบิลคลิกไฟล์ Bridge 1-Click (`.bat`) บนเครื่องกลาง — ระบบจะติดตั้ง, <strong>เพิ่ม Token นี้ต่อท้ายใน `nims-relay-bridge.env` อัตโนมัติ (ไม่ทับ Site เดิม)</strong> และรันเบื้องหลังทันที หรือจะก๊อปปี้ Token ไปต่อท้ายเองในไฟล์เดิมก็ได้ครับ
                </p>
              </div>
            </div>
          ) : (
            <div className="rounded-lg bg-white dark:bg-slate-900 border border-emerald-200 dark:border-emerald-800 p-3 space-y-2">
              <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-300">
                NIMS Server URL (URL ที่เครื่อง Agent หน้างานเรียกมาถึงได้)
              </label>
              <input
                type="text"
                value={nimsServerUrl}
                onChange={(e) => {
                  const next = e.target.value;
                  setNimsServerUrl(next);
                  if (next.trim().toLowerCase().startsWith('https://')) {
                    setAllowInsecureTls(true);
                  }
                }}
                placeholder="https://191.20.110.191:3000"
                className="w-full px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-transparent font-mono text-xs"
              />
              {nimsServerUrl.trim().toLowerCase().startsWith('https://') && (
                <label className="flex items-center gap-2 text-[11px] text-slate-600 dark:text-slate-300 cursor-pointer pt-0.5">
                  <input
                    type="checkbox"
                    checked={allowInsecureTls}
                    onChange={(e) => setAllowInsecureTls(e.target.checked)}
                    className="rounded border-slate-300"
                  />
                  <span>
                    Allow Self-Signed / Internal LAN HTTPS (แนะนำเมื่อใช้ใบรับรองภายในจาก Caddy)
                  </span>
                </label>
              )}
              {isLocalhostUrl && (
                <p className="text-[11px] text-amber-700 dark:text-amber-300 flex items-center gap-1.5">
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                  <span>
                    ตอนนี้เป็น <code className="font-mono">localhost</code> — ถ้านำไปรันบนเครื่องอื่น กรุณาแก้เป็น IP ของเครื่อง NIMS Server (เช่น <code className="font-mono">http://191.20.110.191:3000</code>) ก่อนกดดาวน์โหลด
                  </span>
                </p>
              )}
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2 pt-1">
            <button
              type="button"
              disabled={downloadingRemoteBat}
              onClick={handleDownloadOneClickBat}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-sm cursor-pointer disabled:opacity-60"
            >
              <Wand2 className="h-4 w-4" />
              {downloadingRemoteBat
                ? 'Preparing Remote Installer...'
                : tokenReveal.mode === 'REMOTE'
                ? '2) Download Remote 1-Click (.bat) — ดับเบิลคลิกที่ Site ปลายทาง'
                : 'Download 1-Click Auto Installer (.bat) — ดับเบิลคลิกจบ'}
            </button>
            <a
              href="/api/agents/script"
              download="nims-agent.mjs"
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs font-medium hover:bg-slate-50 dark:hover:bg-slate-800"
            >
              <Download className="h-3.5 w-3.5 text-blue-600" />
              nims-agent.mjs
            </a>
            <button
              type="button"
              onClick={() =>
                downloadTextFile(
                  'nims-agent.env',
                  buildAgentEnvText(
                    tokenReveal.mode === 'REMOTE' ? savedRelayUrl : nimsServerUrl,
                    tokenReveal.rawToken,
                    tokenReveal.mode === 'REMOTE' ? false : allowInsecureTls,
                  ),
                )
              }
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs font-medium hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
            >
              <Download className="h-3.5 w-3.5 text-emerald-600" />
              nims-agent.env
            </button>
            <button
              type="button"
              onClick={() => copyText('cmd', 'node nims-agent.mjs --once')}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-slate-900 text-white text-xs font-mono hover:bg-slate-800 cursor-pointer"
            >
              <Terminal className="h-3.5 w-3.5" />
              {copiedKey === 'cmd' ? 'Copied!' : 'Copy CLI Test'}
            </button>
          </div>
          <p className="text-[11px] text-emerald-800 dark:text-emerald-300">
            {tokenReveal.mode === 'REMOTE'
              ? 'ไฟล์ Remote 1-Click (.bat) มีโค้ด nims-agent.mjs ฝังมาในตัวเลย — ดับเบิลคลิกบนเครื่องปลายทางคนละวงเน็ตได้ทันที (ติดตั้ง Node.js, สร้าง .env ชี้ไป Relay URL, ทดสอบ Ping และรันเบื้องหลังอัตโนมัติ)'
              : 'แนะนำ: กด Download 1-Click Auto Installer (.bat) แล้วนำไปดับเบิลคลิกบนเครื่อง Windows หน้างาน — ระบบจะเช็ก/ติดตั้ง Node.js, ดาวน์โหลดสคริปต์, ทดสอบ Ping, รันเบื้องหลังแบบซ่อนหน้าต่าง และตั้ง Auto-Start ตอนเปิดเครื่องให้อัตโนมัติ'}
          </p>
        </div>
      )}

      {/* Agents List */}
      {loading ? (
        <div className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-8 text-center text-sm text-slate-500">
          Loading site agents...
        </div>
      ) : agents.length === 0 ? (
        <div className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-8 text-center space-y-3">
          <Activity className="h-8 w-8 text-slate-400 mx-auto" />
          <div>
            <h3 className="font-semibold text-sm">No Site Agent Configured</h3>
            <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
              Add a Site Agent to monitor devices inside {siteCode}&apos;s private network without opening inbound firewall ports or changing overlapping IP ranges.
            </p>
          </div>
          {canManage && (
            <button
              type="button"
              onClick={() => {
                setEditingAgent(null);
                setShowForm(true);
              }}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold cursor-pointer"
            >
              <Plus className="h-4 w-4" />
              Create First Site Agent
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {agents.map((agent) => {
            const badge = STATE_BADGE[agent.connectionState] || STATE_BADGE.NEVER_CONNECTED;
            const summary = agent.lastReportSummary;
            return (
              <div
                key={agent.id}
                className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 space-y-3.5"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-bold text-sm">{agent.name}</h3>
                      <span
                        className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full border text-[11px] font-semibold ${badge.className}`}
                      >
                        <span className={`h-1.5 w-1.5 rounded-full ${badge.dot}`} />
                        {badge.label}
                      </span>
                    </div>
                    <div className="text-[11px] font-mono text-slate-500 mt-1">
                      Token: {agent.tokenPrefix}...
                    </div>
                  </div>

                  {canManage && (
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => toggleActive(agent)}
                        title={agent.isActive ? 'Disable agent' : 'Enable agent'}
                        className={`p-1.5 rounded-lg border text-xs cursor-pointer ${
                          agent.isActive
                            ? 'border-emerald-200 text-emerald-600 hover:bg-emerald-50 dark:border-emerald-800 dark:hover:bg-emerald-950/40'
                            : 'border-slate-200 text-slate-500 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800'
                        }`}
                      >
                        <Power className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setEditingAgent(agent);
                          setShowForm(true);
                        }}
                        title="Edit settings"
                        className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setRotateError(null);
                          setRotateTarget(agent);
                        }}
                        title="Rotate token"
                        className="p-1.5 rounded-lg border border-amber-200 dark:border-amber-800 text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-950/40 cursor-pointer"
                      >
                        <KeyRound className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setDeleteError(null);
                          setDeleteTarget(agent);
                        }}
                        title="Delete agent"
                        className="p-1.5 rounded-lg border border-red-200 dark:border-red-800 text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40 cursor-pointer"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 text-xs bg-slate-50 dark:bg-slate-800/50 rounded-lg p-3">
                  <div>
                    <span className="text-slate-500 block text-[11px]">Poll Interval</span>
                    <span className="font-semibold">{agent.pollIntervalSec}s</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block text-[11px]">Offline Threshold</span>
                    <span className="font-semibold">{agent.offlineThreshold} misses</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block text-[11px]">Last Heartbeat</span>
                    <span className="font-semibold" title={agent.lastHeartbeatAt || undefined}>
                      {formatRelativeTime(agent.lastHeartbeatAt)}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-500 block text-[11px]">Probe Host</span>
                    <span className="font-mono font-medium truncate block">
                      {agent.hostname || '-'}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-500 block text-[11px]">Probe IP / OS</span>
                    <span className="font-mono font-medium truncate block">
                      {agent.localIp || '-'} {agent.platform ? `(${agent.platform})` : ''}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-500 block text-[11px]">Last Scan</span>
                    {summary ? (
                      <span className="font-semibold">
                        <span className="text-emerald-600 dark:text-emerald-400">
                          {summary.up} UP
                        </span>
                        {' / '}
                        <span
                          className={
                            summary.down > 0
                              ? 'text-red-600 dark:text-red-400'
                              : 'text-slate-500'
                          }
                        >
                          {summary.down} DOWN
                        </span>
                        {summary.durationMs != null ? ` (${summary.durationMs}ms)` : ''}
                      </span>
                    ) : (
                      <span className="text-slate-400">No scans yet</span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {showForm && (
        <AgentFormModal
          siteId={siteId}
          editing={editingAgent}
          initialRelayUrl={savedRelayUrl}
          onClose={() => {
            setShowForm(false);
            setEditingAgent(null);
          }}
          onCreated={(res) => {
            setShowForm(false);
            setEditingAgent(null);
            if (res.mode === 'REMOTE' && res.relayUrl) {
              updateRelayUrl(res.relayUrl);
            }
            if (res.rawToken) {
              setTokenReveal({
                agentName: res.agent.name,
                rawToken: res.rawToken,
                mode: res.mode || 'LAN',
              });
            }
            loadAgents();
          }}
        />
      )}

      {rotateTarget && (
        <ConfirmActionModal
          title="Rotate Agent Token"
          subtitle="Invalidate previous API token"
          itemName={rotateTarget.name}
          badgeText={`${rotateTarget.tokenPrefix}...`}
          message="Generating a new token will immediately disconnect the running agent until you update its nims-agent.env token."
          variant="warning"
          confirmLabel="Rotate Token"
          loadingLabel="Rotating..."
          loading={rotating}
          error={rotateError}
          onCancel={() => {
            if (!rotating) setRotateTarget(null);
          }}
          onConfirm={confirmRotateToken}
        />
      )}

      {deleteTarget && (
        <ConfirmActionModal
          title="Delete Site Agent"
          subtitle="Permanent probe removal"
          itemName={deleteTarget.name}
          badgeText={deleteTarget.connectionState}
          details={[
            { label: 'Token Prefix', value: `${deleteTarget.tokenPrefix}...` },
            ...(deleteTarget.hostname
              ? [{ label: 'Host', value: deleteTarget.hostname }]
              : []),
          ]}
          message={`Are you sure you want to delete site agent "${deleteTarget.name}"?`}
          variant="danger"
          loading={deleting}
          error={deleteError}
          onCancel={() => {
            if (!deleting) setDeleteTarget(null);
          }}
          onConfirm={confirmDelete}
        />
      )}
    </div>
  );
}

function AgentFormModal({
  siteId,
  editing,
  initialMode = 'LAN',
  initialRelayUrl = '',
  onClose,
  onCreated,
}: {
  siteId: string;
  editing: SiteAgent | null;
  initialMode?: 'LAN' | 'REMOTE';
  initialRelayUrl?: string;
  onClose: () => void;
  onCreated: (res: {
    agent: SiteAgent;
    rawToken?: string;
    mode?: 'LAN' | 'REMOTE';
    relayUrl?: string;
  }) => void;
}) {
  const [name, setName] = useState(editing?.name || '');
  const [networkMode, setNetworkMode] = useState<'LAN' | 'REMOTE'>(initialMode);
  const [relayUrl, setRelayUrl] = useState(initialRelayUrl);
  const [pollIntervalSec, setPollIntervalSec] = useState(
    String(editing?.pollIntervalSec ?? 60),
  );
  const [offlineThreshold, setOfflineThreshold] = useState(
    String(editing?.offlineThreshold ?? 3),
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editing && networkMode === 'REMOTE' && !relayUrl.trim()) {
      setError('กรุณากรอก Relay URL สำหรับ Agent คนละวงเน็ต');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const payload = {
        name: name.trim(),
        pollIntervalSec: Math.max(10, Math.min(3600, parseInt(pollIntervalSec, 10) || 60)),
        offlineThreshold: Math.max(1, Math.min(10, parseInt(offlineThreshold, 10) || 3)),
      };
      if (editing) {
        const res = await apiFetch<{ agent: SiteAgent }>(`/agents/${editing.id}`, {
          method: 'PATCH',
          body: JSON.stringify(payload),
        });
        onCreated({ agent: res.agent });
      } else {
        const res = await apiFetch<{ agent: SiteAgent; rawToken: string }>('/agents', {
          method: 'POST',
          body: JSON.stringify({ siteId, ...payload }),
        });
        onCreated({
          ...res,
          mode: networkMode,
          relayUrl: relayUrl.trim().replace(/\/+$/, ''),
        });
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-md w-full border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-800">
          <h3 className="font-bold text-base flex items-center gap-2">
            {!editing && networkMode === 'REMOTE' && (
              <Globe className="h-4 w-4 text-emerald-600" />
            )}
            {editing
              ? 'Edit Site Agent'
              : networkMode === 'REMOTE'
              ? 'Add Remote Site Agent (คนละวงเน็ต)'
              : 'Add Site Ping Agent'}
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4 text-sm">
          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 dark:bg-red-950/40 dark:border-red-800 px-3 py-2 text-xs text-red-700 dark:text-red-300">
              {error}
            </div>
          )}

          {!editing && (
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setNetworkMode('LAN')}
                className={`px-3 py-2 rounded-lg border text-xs font-semibold text-left transition cursor-pointer ${
                  networkMode === 'LAN'
                    ? 'border-blue-600 bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300'
                    : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'
                }`}
              >
                <div>Same LAN</div>
                <div className="text-[10px] font-normal opacity-80">วงเดียวกับ Server</div>
              </button>
              <button
                type="button"
                onClick={() => setNetworkMode('REMOTE')}
                className={`px-3 py-2 rounded-lg border text-xs font-semibold text-left transition cursor-pointer ${
                  networkMode === 'REMOTE'
                    ? 'border-emerald-600 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300'
                    : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'
                }`}
              >
                <div className="flex items-center gap-1">
                  <Globe className="h-3.5 w-3.5" />
                  <span>Remote (คนละวง)</span>
                </div>
                <div className="text-[10px] font-normal opacity-80">ผ่าน Cloudflare Relay</div>
              </button>
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1">
              Agent Name *
            </label>
            <input
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={
                networkMode === 'REMOTE' ? 'e.g. Site-Rayong Remote Probe' : 'e.g. Plant-Rayong Probe PC'
              }
              className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-transparent"
            />
          </div>

          {!editing && networkMode === 'REMOTE' && (
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1">
                Cloudflare Relay URL *
              </label>
              <input
                required
                value={relayUrl}
                onChange={(e) => setRelayUrl(e.target.value)}
                placeholder="https://nims-relay.xxx.workers.dev"
                className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-transparent font-mono text-xs"
              />
              <p className="text-[10px] text-slate-500 mt-1">
                เครื่องหน้างานจะยิง HTTPS ออกไปยัง Relay URL นี้ แล้วให้เครื่องกลางดึงกลับเข้า NIMS Server
              </p>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1">
                Poll Interval (sec)
              </label>
              <input
                type="number"
                min={10}
                max={3600}
                value={pollIntervalSec}
                onChange={(e) => setPollIntervalSec(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-transparent"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1">
                Offline Misses
              </label>
              <input
                type="number"
                min={1}
                max={10}
                value={offlineThreshold}
                onChange={(e) => setOfflineThreshold(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-transparent"
              />
            </div>
          </div>

          <p className="text-[11px] text-slate-500 leading-relaxed">
            Devices are marked OFFLINE only after failing the configured consecutive ping attempts. Devices manually set to MAINTENANCE keep their status.
          </p>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold disabled:opacity-50 cursor-pointer"
            >
              {saving ? 'Saving...' : editing ? 'Save Changes' : 'Create Agent'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
