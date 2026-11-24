@echo off
chcp 65001 >nul
cd /d "%~dp0"
title TERANAGO SNS Auto-Deploy Watcher

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0watch-deploy.ps1"

if errorlevel 1 (
    echo.
    echo [ERROR] Script exited with an error. Press any key to close...
    pause >nul
)
