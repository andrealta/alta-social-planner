@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo.
call node scripts/conferir.mjs
echo.
pause
