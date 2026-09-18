@echo off
chcp 65001 >nul
cd /d "%~dp0"
set "LOG=%~dp0concorrentes.txt"
echo.
echo  Varrendo o Instagram dos concorrentes...
echo.
call node scripts/concorrentes.mjs %1 > "%LOG%" 2>&1
type "%LOG%"
echo.
pause
