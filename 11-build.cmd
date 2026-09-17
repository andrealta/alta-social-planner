@echo off
chcp 65001 >nul
cd /d "%~dp0"
set "LOG=%~dp0build.txt"
echo.
echo  Compilando o sistema como ele vai rodar em producao.
echo  Isto demora alguns minutos. Nao feche.
echo.
call npm run build > "%LOG%" 2>&1
echo.
echo ============================================
if errorlevel 1 (
  echo   A COMPILACAO FALHOU. O log esta em build.txt
) else (
  echo   Compilou. O sistema esta pronto para publicar.
)
echo ============================================
echo.
type "%LOG%"
echo.
pause
