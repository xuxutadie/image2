@echo off
cd /d "%~dp0"
title Cyber Forge Launcher

echo.
echo ====================================
echo    Cyber Forge - AI Image Generator
echo ====================================
echo.

where node >nul 2>&1
if %ERRORLEVEL% EQU 0 (
    for /f "tokens=*" %%i in ('node --version') do set NODE_VER=%%i
    echo [OK] Node.js found: %NODE_VER%
    echo.
    echo Starting proxy server...
    echo Open http://localhost:3456 in your browser
    echo Press Ctrl+C to stop
    echo ------------------------------------
    node "%~dp0server.js"
    pause
    exit /b
)

echo [ERROR] Node.js not found.
echo.
echo Please install Node.js:
echo   1. Go to https://nodejs.org
echo   2. Download the LTS version
echo   3. Install (click Next through all steps)
echo   4. Run this script again
echo.
echo Open download page now? (Y/N)
choice /c yn /n
if %ERRORLEVEL% EQU 1 (
    start https://nodejs.org
)
pause
exit /b
