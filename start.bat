@echo off
chcp 65001 >nul
cd /d "%~dp0"
title 飞鸟无限天际 本地预览

set "NODE_EXE="
where node >nul 2>nul && for /f "delims=" %%a in ('where node') do set "NODE_EXE=%%a"

if not exist "%NODE_EXE%" (
    set "NODE_EXE=C:\Users\Administrator\.workbuddy\binaries\node\versions\22.22.2\node.exe"
)

if not exist "%NODE_EXE%" (
    echo Error: Node.js not found. Please install node or edit start.bat path.
    pause
    exit /b 1
)

echo Starting local preview server...
"%NODE_EXE%" serve.js
