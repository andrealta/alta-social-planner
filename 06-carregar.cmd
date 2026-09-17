@echo off
chcp 65001 >nul
cd /d "%~dp0"
set "LOG=%~dp0carga.txt"
echo.
echo  Carregando as marcas no banco...
echo.
call node scripts/carregar.mjs > "%LOG%" 2>&1
type "%LOG%"
echo.
pause
