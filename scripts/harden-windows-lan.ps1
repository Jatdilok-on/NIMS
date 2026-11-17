<#
.SYNOPSIS
  Hardens a Windows NIMS server for Local Network (LAN) production use.
.DESCRIPTION
  1. Validates/hardens .env (sets NODE_ENV=production, CORS_ORIGIN, generates missing
     secrets while preserving existing CREDENTIALS_ENCRYPTION_KEY so Vault stays readable).
  2. Locks NTFS permissions on .env, ./data/storage, and ./data/backups to Administrators,
     SYSTEM, and the current service user (removing Users/Everyone access).
  3. Configures Windows Firewall to BLOCK direct LAN access to MongoDB (27017) and
     Backend API (4000), while allowing only Web Portal TCP 3000 (or 443 with -UseHttps),
     optionally scoped to specific -AllowedSubnets.
  4. Audits local MongoDB mongod.cfg for bindIp=127.0.0.1 and security.authorization.
#>
param(
  [string]$ServerHost = "",
  [string[]]$AllowedSubnets = @(),
  [switch]$UseHttps,
  [switch]$AllowDirectBackendPort,
  [switch]$DryRun
)

$ErrorActionPreference = "Stop"
$RootDir = Split-Path -Parent $PSScriptRoot
Set-Location $RootDir

Write-Host "============================================================" -ForegroundColor Cyan
Write-Host " NIMS - Local Network (LAN) Security Hardening" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan

function Test-IsAdmin {
  $current = [Security.Principal.WindowsIdentity]::GetCurrent()
  $principal = New-Object Security.Principal.WindowsPrincipal($current)
  return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

$isAdmin = Test-IsAdmin
if (-not $isAdmin) {
  Write-Host "[WARN] Not running as Administrator. Windows Firewall & some NTFS ACLs require Administrator privileges." -ForegroundColor Yellow
}

# 1. Detect primary Server IP (preferring interface with default gateway)
if (-not $ServerHost) {
  $gwIfIndex = (Get-NetRoute -DestinationPrefix "0.0.0.0/0" -ErrorAction SilentlyContinue |
    Sort-Object RouteMetric |
    Select-Object -First 1 -ExpandProperty InterfaceIndex)
  $detectedIp = $null
  if ($gwIfIndex) {
    $detectedIp = (Get-NetIPAddress -InterfaceIndex $gwIfIndex -AddressFamily IPv4 -ErrorAction SilentlyContinue |
      Where-Object { $_.IPAddress -ne "127.0.0.1" -and $_.IPAddress -notlike "169.254.*" } |
      Select-Object -First 1 -ExpandProperty IPAddress)
  }
  if (-not $detectedIp) {
    $detectedIp = (Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
      Where-Object {
        $_.IPAddress -ne "127.0.0.1" -and
        $_.IPAddress -notlike "169.254.*" -and
        $_.IPAddress -notlike "192.168.56.*" -and
        $_.InterfaceAlias -notmatch "Loopback|vEthernet|VirtualBox|VMware"
      } |
      Select-Object -First 1 -ExpandProperty IPAddress)
  }
  $ServerHost = if ($detectedIp) { $detectedIp } else { "localhost" }
}

$scheme = if ($UseHttps) { "https" } else { "http" }
$primaryOrigin = if ($UseHttps) { "${scheme}://${ServerHost}" } else { "${scheme}://${ServerHost}:3000" }
$corsOrigins = if ($ServerHost -eq "localhost") {
  $primaryOrigin
} else {
  "${primaryOrigin},${scheme}://localhost:3000"
}

Write-Host "[INFO] Target Server Host: $ServerHost ($corsOrigins)" -ForegroundColor Gray

# 2. Harden .env without destroying existing encryption keys
$envPath = Join-Path $RootDir ".env"
if (-not (Test-Path $envPath)) {
  Write-Host "[WARN] .env not found in $RootDir. Skipping .env hardening (run scripts\deploy-windows-server.ps1 first)." -ForegroundColor Yellow
} else {
  $envText = Get-Content $envPath -Raw
  $updated = $false

  if ($envText -notmatch "(?m)^NODE_ENV=production\s*$") {
    $envText = $envText -replace "(?m)^NODE_ENV=.*$", "NODE_ENV=production"
    $updated = $true
  }

  $desiredCookieSecure = if ($UseHttps) { "true" } else { "false" }
  if ($envText -notmatch "(?m)^COOKIE_SECURE=$desiredCookieSecure\s*$") {
    $envText = $envText -replace "(?m)^COOKIE_SECURE=.*$", "COOKIE_SECURE=$desiredCookieSecure"
    $updated = $true
  }

  if ($envText -match "(?m)^CORS_ORIGIN=http://localhost:3000\s*$" -and $ServerHost -ne "localhost") {
    $envText = $envText -replace "(?m)^CORS_ORIGIN=.*$", "CORS_ORIGIN=$corsOrigins"
    $updated = $true
  }

  if ($envText -match "(?m)^JWT_SECRET=(.*)$") {
    $curJwt = $Matches[1].Trim()
    if ($curJwt.Length -lt 32 -or $curJwt -match "CHANGE_ME|dev-only") {
      $newJwt = (node -e "console.log(require('crypto').randomBytes(32).toString('hex'))").Trim()
      $envText = $envText -replace "(?m)^JWT_SECRET=.*$", "JWT_SECRET=$newJwt"
      $updated = $true
      Write-Host "[FIXED] Replaced placeholder JWT_SECRET with a fresh 64-hex secret." -ForegroundColor Green
    } else {
      Write-Host "[PASS] JWT_SECRET is already set with strong key." -ForegroundColor Green
    }
  }

  if ($envText -match "(?m)^CREDENTIALS_ENCRYPTION_KEY=(.*)$") {
    $curKey = $Matches[1].Trim()
    if ($curKey.Length -lt 32 -or $curKey -match "CHANGE_ME") {
      $newKey = (node -e "console.log(require('crypto').randomBytes(32).toString('hex'))").Trim()
      $envText = $envText -replace "(?m)^CREDENTIALS_ENCRYPTION_KEY=.*$", "CREDENTIALS_ENCRYPTION_KEY=$newKey"
      $updated = $true
      Write-Host "[FIXED] Replaced placeholder CREDENTIALS_ENCRYPTION_KEY with a fresh 64-hex key." -ForegroundColor Green
    } else {
      Write-Host "[PASS] Existing CREDENTIALS_ENCRYPTION_KEY preserved (Access Vault records remain intact)." -ForegroundColor Green
    }
  }

  if ($updated -and (-not $DryRun)) {
    [System.IO.File]::WriteAllText($envPath, $envText, (New-Object System.Text.UTF8Encoding($false)))
    Write-Host "[OK] Updated .env security configuration (NODE_ENV=production, COOKIE_SECURE=$desiredCookieSecure)." -ForegroundColor Green
  } elseif ($updated) {
    Write-Host "[DRY-RUN] Would update .env (NODE_ENV=production, COOKIE_SECURE=$desiredCookieSecure)." -ForegroundColor Yellow
  }
}

# 3. Restrict NTFS permissions on .env, ./data/storage, ./data/backups
$currentPrincipal = if ($env:USERDOMAIN) { "$($env:USERDOMAIN)\$($env:USERNAME)" } else { $env:USERNAME }
$aclTargets = @(
  $envPath,
  (Join-Path $RootDir "data\storage"),
  (Join-Path $RootDir "data\backups")
)

foreach ($target in $aclTargets) {
  if (-not (Test-Path $target)) { continue }
  if ($DryRun) {
    Write-Host "[DRY-RUN] Would lock NTFS ACLs on $target to Administrators, SYSTEM, $currentPrincipal" -ForegroundColor Yellow
    continue
  }
  try {
    $isContainer = (Get-Item $target).PSIsContainer
    $permFlag = if ($isContainer) { "(OI)(CI)F" } else { "F" }
    & icacls $target /inheritance:r /grant:r "*S-1-5-32-544:${permFlag}" "*S-1-5-18:${permFlag}" "${currentPrincipal}:${permFlag}" | Out-Null
    Write-Host "[PASS] Restricted NTFS permissions on $target" -ForegroundColor Green
  } catch {
    Write-Host "[WARN] Could not restrict NTFS permissions on ${target}: $($_.Exception.Message)" -ForegroundColor Yellow
  }
}

# 4. Windows Firewall Hardening
if ($isAdmin) {
  if ($DryRun) {
    Write-Host "[DRY-RUN] Would configure Windows Firewall rules (Block 27017 & 4000; Allow 3000)." -ForegroundColor Yellow
  } else {
    # Block MongoDB direct LAN access
    $mongoRuleName = "NIMS Block MongoDB LAN (TCP 27017)"
    Get-NetFirewallRule -DisplayName $mongoRuleName -ErrorAction SilentlyContinue | Remove-NetFirewallRule -ErrorAction SilentlyContinue
    New-NetFirewallRule -DisplayName $mongoRuleName -Direction Inbound -Protocol TCP -LocalPort 27017 -Action Block -Profile Any | Out-Null
    Write-Host "[PASS] Blocked Inbound TCP 27017 (MongoDB) in Windows Firewall." -ForegroundColor Green

    # Block direct Backend API 4000 (Next.js on 3000 proxies /api/* internally)
    $backendRuleName = "NIMS Block Backend Direct LAN (TCP 4000)"
    Get-NetFirewallRule -DisplayName $backendRuleName -ErrorAction SilentlyContinue | Remove-NetFirewallRule -ErrorAction SilentlyContinue
    if (-not $AllowDirectBackendPort) {
      New-NetFirewallRule -DisplayName $backendRuleName -Direction Inbound -Protocol TCP -LocalPort 4000 -Action Block -Profile Any | Out-Null
      Write-Host "[PASS] Blocked Inbound TCP 4000 (Backend API proxied via port 3000)." -ForegroundColor Green
    } else {
      Write-Host "[INFO] Allowed direct Backend TCP 4000 as requested (-AllowDirectBackendPort)." -ForegroundColor Yellow
    }

    # Allow Web Portal TCP 3000 (and 443 if HTTPS)
    $webRuleName = "NIMS Web Portal (TCP 3000)"
    Get-NetFirewallRule -DisplayName $webRuleName -ErrorAction SilentlyContinue | Remove-NetFirewallRule -ErrorAction SilentlyContinue
    $fwParams = @{
      DisplayName = $webRuleName
      Direction   = "Inbound"
      Protocol    = "TCP"
      LocalPort   = 3000
      Action      = "Allow"
      Profile     = @("Domain", "Private")
    }
    if ($AllowedSubnets.Count -gt 0) {
      $fwParams["RemoteAddress"] = $AllowedSubnets
      Write-Host "[PASS] Allowed TCP 3000 only from subnets: $($AllowedSubnets -join ', ')" -ForegroundColor Green
    } else {
      Write-Host "[PASS] Allowed TCP 3000 on Domain/Private LAN profiles (pass -AllowedSubnets to scope by IP/CIDR)." -ForegroundColor Green
    }
    New-NetFirewallRule @fwParams | Out-Null

    if ($UseHttps) {
      $httpsRuleName = "NIMS Web Portal HTTPS (TCP 443)"
      Get-NetFirewallRule -DisplayName $httpsRuleName -ErrorAction SilentlyContinue | Remove-NetFirewallRule -ErrorAction SilentlyContinue
      $httpsParams = $fwParams.Clone()
      $httpsParams["DisplayName"] = $httpsRuleName
      $httpsParams["LocalPort"] = 443
      New-NetFirewallRule @httpsParams | Out-Null
      Write-Host "[PASS] Allowed HTTPS TCP 443 on Domain/Private profiles." -ForegroundColor Green
    }
  }
}

# 5. Audit local mongod.cfg (read-only advice)
$mongodCfg = Get-ChildItem "C:\Program Files\MongoDB\Server\*\bin\mongod.cfg" -ErrorAction SilentlyContinue | Select-Object -First 1
if ($mongodCfg) {
  $cfgText = Get-Content $mongodCfg.FullName -Raw
  if ($cfgText -match "bindIp:\s*0\.0\.0\.0") {
    Write-Host "[WARN] MongoDB config ($($mongodCfg.FullName)) uses bindIp: 0.0.0.0. Recommend changing to bindIp: 127.0.0.1" -ForegroundColor Yellow
  } else {
    Write-Host "[PASS] MongoDB bindIp is not 0.0.0.0 ($($mongodCfg.FullName))." -ForegroundColor Green
  }
  if ($cfgText -notmatch "(?ms)security:\s*.*?authorization:\s*enabled") {
    Write-Host "[WARN] MongoDB user authentication is not enabled in mongod.cfg (Firewall now blocks port 27017, but enabling MongoDB auth is recommended)." -ForegroundColor Yellow
  } else {
    Write-Host "[PASS] MongoDB security.authorization is enabled." -ForegroundColor Green
  }
}

Write-Host ""
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host " Done! Important Next Steps:" -ForegroundColor Cyan
Write-Host "  1. Restart NIMS Backend & Frontend so .env changes take effect." -ForegroundColor White
Write-Host "  2. Copy .env safely offline (never lose CREDENTIALS_ENCRYPTION_KEY)." -ForegroundColor White
Write-Host "  3. For LAN HTTPS, run Caddy using scripts\Caddyfile.lan.example and re-run with -UseHttps." -ForegroundColor White
Write-Host "============================================================" -ForegroundColor Cyan
