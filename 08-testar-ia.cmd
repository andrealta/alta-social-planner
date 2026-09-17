@echo off
chcp 65001 >nul
cd /d "%~dp0"
set "LOG=%~dp0sonda-ia.txt"
echo.
echo  Sondando a API da Anthropic. Leva menos de um minuto...
echo.
call node scripts/testar-ia.mjs > "%LOG%" 2>&1
type "%LOG%"
echo.
pause
