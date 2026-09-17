@echo off
chcp 65001 >nul
cd /d "%~dp0"
set "LOG=%~dp0instagram.txt"
echo.
echo  Trazendo as legendas do Instagram para a base da marca...
echo.
call node scripts/instagram.mjs %1 > "%LOG%" 2>&1
type "%LOG%"
echo.
pause
