@echo off
chcp 65001 >nul
cd /d "%~dp0"
set "LOG=%~dp0restaurar.txt"
echo.
echo  Devolvendo o custo dos planejamentos excluidos...
echo.
call node scripts/restaurar-custos.mjs > "%LOG%" 2>&1
type "%LOG%"
echo.
pause
