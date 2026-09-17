@echo off
chcp 65001 >nul
cd /d "%~dp0"
set "LOG=%~dp0espelho.txt"
echo.
echo  Copiando as telas para a pasta _espelho...
echo.
call node scripts/espelho.mjs > "%LOG%" 2>&1
type "%LOG%"
echo.
pause
