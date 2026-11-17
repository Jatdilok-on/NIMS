param(
  [ValidateSet('dev', 'start', 'setup')]
  [string]$Mode = 'dev'
)

$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot

Write-Host "===============================================" -ForegroundColor Cyan
Write-Host " NIMS - Network Infrastructure Management" -ForegroundColor Cyan
Write-Host " Runtime: Node.js + MongoDB (No Docker)" -ForegroundColor Cyan
Write-Host "===============================================" -ForegroundColor Cyan

if (-not (Test-Path ".env")) {
  node scripts/run-nims.mjs setup-db
}

if ($Mode -eq 'setup') {
  npm run setup:db
  exit $LASTEXITCODE
}

if ($Mode -eq 'start') {
  npm run build
  npm run start
} else {
  npm run dev
}
