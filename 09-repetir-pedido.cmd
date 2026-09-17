@echo off
chcp 65001 >nul
cd /d "%~dp0"
set "LOG=%~dp0repeticao.txt"
echo.
echo  Repetindo o ultimo pedido fora do Next. Pode levar ate 3 minutos...
echo.
call node scripts/testar-prompt.mjs > "%LOG%" 2>&1
type "%LOG%"
echo.
pause
