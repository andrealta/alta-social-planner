@echo off
chcp 65001 >nul
cd /d "%~dp0"
set "LOG=%~dp0cadastro.txt"
echo.
echo  Testando a criacao de pessoa com senha, fora do site...
echo.
call node scripts/testar-cadastro.mjs > "%LOG%" 2>&1
type "%LOG%"
echo.
pause
