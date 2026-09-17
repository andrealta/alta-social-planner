@echo off
chcp 65001 >nul
cd /d "%~dp0"
set "LOG=%~dp0backup.txt"
echo.
echo  Tirando um backup completo do banco...
echo.
call node scripts/exportar.mjs > "%LOG%" 2>&1
type "%LOG%"
echo.
pause
