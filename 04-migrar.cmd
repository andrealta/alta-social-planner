@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"
set "LOG=%~dp0migracao.txt"

if not exist ".env.local" (
  echo.
  echo  ERRO: o arquivo  .env.local  nao existe nesta pasta.
  echo.
  echo  Faca uma copia do arquivo  .env.example  com o nome  .env.local
  echo  e preencha a DATABASE_URL antes de rodar este arquivo.
  echo.
  pause
  exit /b 1
)

echo.
echo  Aplicando as migracoes no banco...
echo  Pode levar de 10 a 60 segundos.
echo.

call npm install >nul 2>&1
call node scripts/migrar.mjs > "%LOG%" 2>&1
set CODIGO=%ERRORLEVEL%

type "%LOG%"

echo.
if "%CODIGO%"=="0" (
  echo  ------------------------------------------------
  echo   Deu certo. O arquivo  migracao.txt  tem o detalhe.
  echo  ------------------------------------------------
) else (
  echo  ------------------------------------------------
  echo   Deu problema. O arquivo  migracao.txt  tem o erro.
  echo   Me avise que eu leio e conserto.
  echo  ------------------------------------------------
)
echo.
pause
