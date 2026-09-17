@echo off
chcp 65001 >nul
cd /d "%~dp0"
set "LOG=%~dp0aplicado.txt"
echo.
echo  Devolvendo o que esta no _espelho para o projeto...
echo.
call node scripts/espelho.mjs voltar > "%LOG%" 2>&1
type "%LOG%"
echo.
pause
