@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo.
echo  Iniciando o Alta Social Planner...
echo.
echo  Quando aparecer  "Ready"  abaixo, abra o navegador em:
echo.
echo       http://localhost:3000
echo.
echo  Para PARAR o sistema: clique nesta janela e aperte Ctrl+C.
echo  Enquanto ela estiver aberta, o sistema esta no ar.
echo.
call npm run dev
pause
