@echo off
chcp 65001 >nul
cd /d "%~dp0"
set "LOG=%~dp0seguranca.txt"
echo.
echo  Conferindo as travas de seguranca no banco de verdade...
echo.
call node scripts/seguranca.mjs > "%LOG%" 2>&1
type "%LOG%"
echo.
pause
