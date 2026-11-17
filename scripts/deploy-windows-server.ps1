<#
.SYNOPSIS
  NIMS Production Setup & Launcher for Windows Server (Clean Installation)
.DESCRIPTION
  Sets up .env with fresh cryptographic secrets, installs dependencies, initializes
  MongoDB Replica Set (rs0) + Prisma schema, builds backend & frontend for production,
  optionally opens Windows Firewall port 3000, and starts NIMS via PM2 (if available).
#>
param(
  [string]$ServerHost = "",
  [switch]$UseHttps,
  [string]$DataDir = "",
  [switch]$OpenFirewall,
  [switch]$ForceEnv,
  [switch]$ForceBuild,
  [switch]$SkipPm2,
  [switch]$InstallStartupTask
)

$ErrorActionPreference = "Stop"
$RootDir = Split-Path -Parent $PSScriptRoot
Set-Location $RootDir

Write-Host "============================================================" -ForegroundColor Cyan
Write-Host " NIMS - Windows Server Production Deployment Setup" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan

# 1. Verify Node.js and npm
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  Write-Error "Node.js is not installed or not in PATH. Please install Node.js LTS (v20+) first."
  exit 1
}
Write-Host "[OK] Node.js $(node -v) / npm $(npm -v)" -ForegroundColor Green

# 2. Check MongoDB Windows Service (if running locally)
$mongoSvc = Get-Service -Name "MongoDB" -ErrorAction SilentlyContinue
if ($mongoSvc) {
  if ($mongoSvc.Status -ne "Running") {
    Write-Host "[INFO] Starting MongoDB Windows Service..." -ForegroundColor Yellow
    Start-Service -Name "MongoDB"
  }
  Write-Host "[OK] MongoDB service status: $($mongoSvc.Status)" -ForegroundColor Green
} else {
  Write-Host "[WARN] Local 'MongoDB' Windows service was not detected. Make sure MongoDB (Replica Set rs0) is running or update DATABASE_URL in .env." -ForegroundColor Yellow
}

# 3. Determine Server Host / Origin
if (-not $ServerHost) {
  $detectedIp = (Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
    Where-Object { $_.IPAddress -ne "127.0.0.1" -and $_.IPAddress -notlike "169.254.*" -and $_.PrefixOrigin -ne "WellKnown" } |
    Select-Object -First 1 -ExpandProperty IPAddress)
  $defaultHint = if ($detectedIp) { $detectedIp } else { "localhost" }
  $inputHost = Read-Host "Enter Server IP or Domain for users to access NIMS (Press Enter for '$defaultHint')"
  $ServerHost = if ([string]::IsNullOrWhiteSpace($inputHost)) { $defaultHint } else { $inputHost.Trim() }
}

$scheme = if ($UseHttps) { "https" } else { "http" }
$corsOrigin = if ($ServerHost -match "^https?://") {
  $ServerHost.TrimEnd("/")
} elseif ($UseHttps) {
  "${scheme}://${ServerHost}"
} else {
  "${scheme}://${ServerHost}:3000"
}

$storagePath = if ($DataDir) { Join-Path $DataDir "storage" } else { ".\data\storage" }
$backupPath = if ($DataDir) { Join-Path $DataDir "backups" } else { ".\data\backups" }

# 4. Create or preserve .env
$envPath = Join-Path $RootDir ".env"
$envExamplePath = Join-Path $RootDir ".env.example"

if (-not (Test-Path $envPath) -or $ForceEnv) {
  if (-not (Test-Path $envExamplePath)) {
    Write-Error ".env.example not found in $RootDir"
    exit 1
  }
  $jwtSecret = node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
  $encKey = node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

  $content = Get-Content $envExamplePath -Raw
  $content = $content.Replace("CHANGE_ME_64_HEX_JWT_SECRET", $jwtSecret.Trim())
  $content = $content.Replace("CHANGE_ME_64_HEX_AES_256_GCM_KEY", $encKey.Trim())
  $content = $content -replace "(?m)^NODE_ENV=.*$", "NODE_ENV=production"
  $content = $content -replace "(?m)^CORS_ORIGIN=.*$", "CORS_ORIGIN=$corsOrigin"
  $content = $content -replace "(?m)^COOKIE_SECURE=.*$", ("COOKIE_SECURE=" + ($(if ($UseHttps) { "true" } else { "false" })))
  $content = $content -replace "(?m)^STORAGE_ROOT=.*$", "STORAGE_ROOT=$storagePath"
  $content = $content -replace "(?m)^BACKUP_ROOT=.*$", "BACKUP_ROOT=$backupPath"

  [System.IO.File]::WriteAllText($envPath, $content, (New-Object System.Text.UTF8Encoding($false)))
  Write-Host "[OK] Created .env for Production (CORS_ORIGIN=$corsOrigin)" -ForegroundColor Green
} else {
  Write-Host "[OK] Existing .env preserved (use -ForceEnv to regenerate)." -ForegroundColor Yellow
}

# 5. Install dependencies (skip automatically when pre-packaged offline)
$hasOfflineDeps = (Test-Path "backend\node_modules") -and (Test-Path "frontend\node_modules") -and (Test-Path "backend\node_modules\.prisma\client\index.js")
if ($hasOfflineDeps) {
  Write-Host "`n[STEP 1/4] Pre-installed offline dependencies & Prisma Client detected; skipping npm install." -ForegroundColor Green
  $env:NIMS_OFFLINE = "1"
} else {
  Write-Host "`n[STEP 1/4] Installing dependencies & generating Prisma Client..." -ForegroundColor Cyan
  npm run install:all
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}

# 6. Setup clean database (Replica Set rs0 + Schema + Reference seed)
Write-Host "`n[STEP 2/4] Initializing MongoDB Replica Set (rs0) & Schema..." -ForegroundColor Cyan
npm run setup:db
if ($LASTEXITCODE -ne 0) {
  Write-Host "`n[ACTION REQUIRED] If MongoDB is missing Replica Set 'rs0', add to mongod.cfg:" -ForegroundColor Red
  Write-Host "  replication:`n    replSetName: `"rs0`"" -ForegroundColor Yellow
  Write-Host "Then run: Restart-Service MongoDB  and re-run this script." -ForegroundColor Yellow
  exit 1
}

# 7. Build Backend & Frontend for Production (skip if already pre-built offline)
$hasPrebuilt = (Test-Path "backend\dist\index.js") -and (Test-Path "frontend\.next\BUILD_ID")
if ($hasPrebuilt -and (-not $ForceBuild)) {
  Write-Host "`n[STEP 3/4] Pre-built Backend (dist) & Frontend (.next) detected; skipping build." -ForegroundColor Green
} else {
  Write-Host "`n[STEP 3/4] Building Backend & Frontend for Production..." -ForegroundColor Cyan
  npm run build
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}

# 8. Optional Windows Firewall Rule (Port 3000)
if ($OpenFirewall) {
  Write-Host "`n[STEP] Opening Windows Firewall Inbound TCP Port 3000..." -ForegroundColor Cyan
  try {
    $existingRule = Get-NetFirewallRule -DisplayName "NIMS Web Portal (TCP 3000)" -ErrorAction SilentlyContinue
    if (-not $existingRule) {
      New-NetFirewallRule -DisplayName "NIMS Web Portal (TCP 3000)" -Direction Inbound -Protocol TCP -LocalPort 3000 -Action Allow | Out-Null
    }
    Write-Host "[OK] Firewall Port 3000 opened." -ForegroundColor Green
  } catch {
    Write-Host "[WARN] Could not configure Windows Firewall automatically (run PowerShell as Administrator or open TCP 3000 manually)." -ForegroundColor Yellow
  }
}

# 9. Start via PM2 or provide next command
Write-Host "`n[STEP 4/4] Starting Production Services..." -ForegroundColor Cyan
if (-not $SkipPm2 -and (Get-Command pm2 -ErrorAction SilentlyContinue)) {
  $backendDir = Join-Path $RootDir "backend"
  $frontendDir = Join-Path $RootDir "frontend"

  pm2 delete nims-backend 2>$null | Out-Null
  pm2 delete nims-frontend 2>$null | Out-Null

  $nextBin = Join-Path $frontendDir "node_modules\next\dist\bin\next"
  pm2 start (Join-Path $backendDir "dist\index.js") --name "nims-backend" --cwd $backendDir
  pm2 start $nextBin --name "nims-frontend" --cwd $frontendDir -- start -p 3000
  pm2 save

  Write-Host "`n============================================================" -ForegroundColor Green
  Write-Host " NIMS Production is RUNNING via PM2!" -ForegroundColor Green
  Write-Host " Open in browser: $corsOrigin" -ForegroundColor Green
  Write-Host " Check status: pm2 status | Logs: pm2 logs" -ForegroundColor Green
  Write-Host "============================================================" -ForegroundColor Green
} elseif ($InstallStartupTask) {
  $logsDir = Join-Path $RootDir "logs"
  if (-not (Test-Path $logsDir)) { New-Item -ItemType Directory -Path $logsDir | Out-Null }
  $cmdWrapper = Join-Path $RootDir "scripts\run-nims-task.cmd"
  $nodeExe = (Get-Command node).Source
  $cmdBody = "@echo off`r`ncd /d `"$RootDir`"`r`n`"$nodeExe`" `"$RootDir\scripts\run-nims.mjs`" start >> `"$logsDir\nims-server.log`" 2>&1`r`n"
  [System.IO.File]::WriteAllText($cmdWrapper, $cmdBody, (New-Object System.Text.UTF8Encoding($false)))

  $taskName = "NIMS Production Server"
  $existingTask = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
  if ($existingTask) {
    Stop-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
    Unregister-ScheduledTask -TaskName $taskName -Confirm:$false
  }

  $action = New-ScheduledTaskAction -Execute "cmd.exe" -Argument "/c `"$cmdWrapper`"" -WorkingDirectory $RootDir
  $trigger = New-ScheduledTaskTrigger -AtStartup
  $principal = New-ScheduledTaskPrincipal -UserId "SYSTEM" -LogonType ServiceAccount -RunLevel Highest
  $settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit (New-TimeSpan -Seconds 0) -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1)

  Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Description "NIMS Backend & Frontend Production Server" | Out-Null
  Start-ScheduledTask -TaskName $taskName

  Write-Host "`n============================================================" -ForegroundColor Green
  Write-Host " NIMS Production is RUNNING via Windows Scheduled Task!" -ForegroundColor Green
  Write-Host " Task Name : $taskName (auto-starts on server boot)" -ForegroundColor Green
  Write-Host " Log File  : $logsDir\nims-server.log" -ForegroundColor Green
  Write-Host " Open URL  : $corsOrigin" -ForegroundColor Green
  Write-Host "============================================================" -ForegroundColor Green
} else {
  Write-Host "`n[INFO] PM2 not found (or -SkipPm2 set)." -ForegroundColor Yellow
  Write-Host "Option 1 - Run in foreground right now:  npm start" -ForegroundColor White
  Write-Host "Option 2 - Run in background + auto-start on boot (no internet/PM2 needed):" -ForegroundColor White
  Write-Host "  powershell -ExecutionPolicy Bypass -File .\scripts\deploy-windows-server.ps1 -ServerHost $ServerHost -InstallStartupTask" -ForegroundColor Cyan
  Write-Host "`nAccess URL once started: $corsOrigin" -ForegroundColor Green
}
