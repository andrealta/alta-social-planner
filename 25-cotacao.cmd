@echo off
rem O chcp e chamado pelo caminho inteiro de proposito: chamado so pelo
rem nome ele as vezes nao e encontrado, e quando falha o console volta
rem para a tabela antiga e todo acento vira simbolo estranho.
%SystemRoot%\System32\chcp.com 65001 >nul 2>&1
cd /d "%~dp0"
setlocal
set "LOG=%~dp0cotacao.txt"

set "CMD=%~1"
if not "%CMD%"=="" goto rodar

echo.
echo  Cotacao do dolar. Digite so o NUMERO e tecle Enter.
echo.
echo  A pagina de Precisao mostra o custo da IA em real. Para isso ela
echo  precisa da cotacao de cada dia guardada. Normalmente ela busca
echo  sozinha; isto aqui serve para conferir e para preencher o passado.
echo.
echo    1  buscar    pegar a cotacao de hoje e preencher os dias que faltam
echo    2  ver       so mostrar o que ja esta guardado
echo    3  testar    so testar as fontes, sem gravar nada
echo.
set /p "N=  Numero: "

if "%N%"=="1" set "CMD=buscar"
if "%N%"=="2" set "CMD=ver"
if "%N%"=="3" set "CMD=testar"
if "%CMD%"=="" set "CMD=buscar"

:rodar
echo.
call node scripts/cotacao.mjs %CMD% > "%LOG%" 2>&1
type "%LOG%"
echo.
echo  (esta tela tambem ficou salva em cotacao.txt)
echo.
pause
