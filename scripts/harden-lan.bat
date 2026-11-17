@echo off
setlocal
title NIMS - Local Network Security Hardening
cd /d "%~dp0.."

net session >nul 2>&1
if errorlevel 1 (
  echo Requesting Administrator privileges...
  powershell -NoProfile -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
  exit /b 0
)

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0harden-windows-lan.ps1"
pause
