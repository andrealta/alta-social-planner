@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion
cd /d "%~dp0"

echo.
call node scripts/usuarios.mjs
echo.
echo  --------------------------------------------------------
echo   Para mudar o papel de alguem, digite o e-mail.
echo   Para so sair, aperte Enter.
echo  --------------------------------------------------------
echo.

set "EMAIL="
set /p EMAIL=  E-mail: 

if "!EMAIL!"=="" goto :fim

echo.
echo   Papeis:  admin  = administra tudo, ve todas as marcas
echo            staff  = equipe da Alta, ve so as marcas dela
echo            client = cliente, ve so o que foi liberado
echo.
set "PAPEL="
set /p PAPEL=  Papel: 

if "!PAPEL!"=="" goto :fim

echo.
call node scripts/usuarios.mjs "!EMAIL!" "!PAPEL!"

:fim
echo.
pause
