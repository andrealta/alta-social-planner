@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"
set "LOG=%~dp0instalacao.txt"

echo ============================================ > "%LOG%"
echo  Instalacao das dependencias >> "%LOG%"
echo  %DATE% %TIME% >> "%LOG%"
echo ============================================ >> "%LOG%"
echo. >> "%LOG%"

echo  Instalando. Pode levar de 1 a 3 minutos.
echo  Nao feche esta janela.
echo.

echo [1/2] npm install >> "%LOG%"
call npm install >> "%LOG%" 2>&1
echo. >> "%LOG%"

echo [2/2] tipos do TypeScript >> "%LOG%"
call npm install --save-dev typescript @types/node @types/react @types/react-dom >> "%LOG%" 2>&1
echo. >> "%LOG%"

echo [package.json final] >> "%LOG%"
type package.json >> "%LOG%" 2>&1
echo. >> "%LOG%"

echo ============================================ >> "%LOG%"
echo  fim >> "%LOG%"
echo ============================================ >> "%LOG%"

echo.
echo  Terminou. O arquivo  instalacao.txt  foi criado nesta pasta.
echo  Me avise para eu conferir antes de rodar o sistema.
echo.
pause
