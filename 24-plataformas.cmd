@echo off
rem O chcp e chamado pelo caminho inteiro de proposito: chamado so pelo
rem nome ele as vezes nao e encontrado, e quando falha o console volta
rem para a tabela antiga e todo acento vira simbolo estranho.
%SystemRoot%\System32\chcp.com 65001 >/dev/null 2>&1
cd /d "%~dp0"
setlocal
set "LOG=%~dp0plataformas.txt"

set "CMD=%~1"
set "A=%~2"

if not "%CMD%"=="" goto rodar

echo.
echo  Estado das plataformas. Digite so o NUMERO e tecle Enter.
echo.
echo  O que mudou no Meta, no TikTok e nos outros, lido nas fontes
echo  oficiais deles. A nota entra no prompt de TODAS as marcas, e por
echo  isso ela so passa a valer depois que voce ler e aprovar.
echo.
echo    1  ver          a nota valendo hoje, e a pendente se houver
echo    2  gerar        buscar e escrever uma nota nova (fica pendente)
echo    3  aprovar      a nota pendente passa a valer
echo    4  descartar    recusar a nota pendente
echo    5  historico    as ultimas notas e o custo delas
echo.
set /p "N=  Numero: "

if "%N%"=="1" set "CMD=ver"
if "%N%"=="2" goto pedirDias
if "%N%"=="3" set "CMD=aprovar"
if "%N%"=="4" goto pedirMotivo
if "%N%"=="5" set "CMD=historico"
if "%CMD%"=="" set "CMD=ver"
goto rodar

:pedirDias
set "CMD=gerar"
echo.
echo  Quantos dias para tras olhar. Em branco usa 30, que e o normal
echo  para quem roda toda semana. Na primeira vez, 90 da mais contexto.
set /p "A=  Dias: "
goto rodar

:pedirMotivo
set "CMD=descartar"
echo.
echo  Por que esta recusando. Fica gravado junto com a nota.
set /p "A=  Motivo: "
goto rodar

:rodar
if "%CMD%"=="" set "CMD=ver"
echo.
echo  Plataformas: %CMD% %A%
echo.
call node scripts/plataformas.mjs %CMD% "%A%" > "%LOG%" 2>&1
type "%LOG%"
echo.
pause
