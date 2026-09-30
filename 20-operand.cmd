@echo off
rem O chcp e chamado pelo caminho inteiro de proposito: chamado so pelo
rem nome ele as vezes nao e encontrado, e quando falha o console volta
rem para a tabela antiga e todo acento vira simbolo estranho.
%SystemRoot%\System32\chcp.com 65001 >nul 2>&1
cd /d "%~dp0"
setlocal
set "LOG=%~dp0operand.txt"

set "CMD=%~1"
set "A=%~2"
set "B=%~3"
set "C=%~4"

if not "%CMD%"=="" goto rodar

echo.
echo  Operand. Digite so o NUMERO da opcao e tecle Enter.
echo.
echo    1  conferir       a conexao com o Operand funciona?
echo    2  rede           onde a conexao trava?
echo    3  sondar         quais rotas do Operand respondem?
echo    4  cru            ver a resposta crua de uma rota
echo.
echo    5  clientes       listar ou procurar clientes no Operand
echo    6  marcas         ver quais marcas ja estao ligadas
echo    7  ligar          ligar uma marca daqui a um cliente de la
echo    8  desligar       desfazer a ligacao de uma marca
echo.
echo    9  jobs           ver o que entraria de uma marca, sem gravar
echo   10  sincronizar    trazer os jobs para o planner
echo   11  provar         descobrir qual numero o Operand chama de job
echo   12  linhas         quais marcas existem dentro do cliente do Operand
echo   13  perfil         montar o retrato de producao da marca
echo.
echo   14  preparar       ligar + sincronizar + retrato, de uma vez so
echo   15  diario         a rotina de todo dia, em todas as marcas
echo.
set /p "N=  Numero: "

if "%N%"=="1" set "CMD=conferir"
if "%N%"=="2" set "CMD=rede"
if "%N%"=="3" set "CMD=sondar"
if "%N%"=="4" goto pedirRota
if "%N%"=="5" goto pedirNome
if "%N%"=="6" set "CMD=marcas"
if "%N%"=="7" goto pedirLigar
if "%N%"=="8" goto pedirDesligar
if "%N%"=="9" goto pedirMarcaJobs
if "%N%"=="10" goto pedirMarcaSinc
if "%N%"=="11" goto pedirMarcaProvar
if "%N%"=="12" goto pedirMarcaLinhas
if "%N%"=="13" goto pedirMarcaPerfil
if "%N%"=="14" goto pedirPreparar
if "%N%"=="15" set "CMD=diario"
goto rodar

:pedirLigar
set "CMD=ligar"
echo.
echo  O slug e o nome curto da marca aqui no planner.
echo  O id e o numero que aparece na lista de clientes (opcao 5).
set /p "A=  Slug da marca: "
set /p "B=  Id do cliente no Operand: "
echo.
echo  Se esse cliente do Operand abriga mais de uma marca, diga quais
echo  linhas sao desta. Separe por virgula, sem espaco depois. Exemplo:
echo     Queens,Queensberry
echo  Um termo com ! na frente exclui, por exemplo: Hero,!Hero Brasil
set /p "C=  Linhas (ou Enter para pegar tudo): "
goto rodar

:pedirDesligar
set "CMD=desligar"
echo.
set /p "A=  Slug da marca: "
goto rodar

:pedirPreparar
set "CMD=preparar"
echo.
echo  Isto faz tudo: liga a marca, traz os jobs e monta o retrato.
echo  Antes, use a opcao 5 para achar o numero do cliente no Operand,
echo  e a opcao 12 com esse numero para ver quais linhas existem nele.
echo.
set /p "A=  Slug da marca aqui no planner: "
set /p "B=  Numero do cliente no Operand: "
echo.
echo  Se esse cliente abriga mais de uma marca, diga quais linhas sao
echo  desta. Separe por virgula.
echo.
echo  ATENCAO ao sinal de exclamacao: ele EXCLUI a linha.
echo     Hero            pega Hero, Hero Geleias E Hero Brasil
echo     Hero,!Hero Brasil   pega Hero e Hero Geleias, sem a fabricante
echo.
echo  Um termo pega tambem tudo que comeca com ele. Entao "Hero" ja
echo  inclui "Hero Geleias", e nao precisa listar as duas.
set /p "C=  Linhas (ou Enter para pegar tudo): "
goto rodar

:pedirMarcaPerfil
set "CMD=perfil"
echo.
set /p "A=  Slug da marca: "
echo.
echo  Digite  ver  para so olhar sem gravar, ou Enter para gravar.
set /p "B=  Gravar? "
goto rodar

:pedirMarcaLinhas
set "CMD=linhas"
echo.
set /p "A=  Slug da marca, ou o numero do cliente no Operand: "
goto rodar

:pedirMarcaProvar
set "CMD=provar"
echo.
set /p "A=  Slug da marca: "
goto rodar

:pedirMarcaJobs
set "CMD=jobs"
echo.
set /p "A=  Slug da marca: "
goto rodar

:pedirMarcaSinc
set "CMD=sincronizar"
echo.
echo  Sem digitar nada, sincroniza todas as marcas ligadas.
set /p "A=  Uma marca so? (o slug, ou Enter para todas): "
goto rodar

:pedirNome
set "CMD=clientes"
echo.
echo  Sem digitar nada, mostra so os clientes que tem job.
set /p "A=  Procurar por parte do nome (ou Enter para pular): "
goto rodar

:pedirRota
set "CMD=cru"
echo.
set /p "A=  Qual rota? (exemplo: /beta/entity/clients): "
goto rodar

:rodar
if "%CMD%"=="" set "CMD=conferir"
echo.
echo  Operand: %CMD% %A% %B% %C%
echo.
call node scripts/operand.mjs %CMD% %A% %B% "%C%" > "%LOG%" 2>&1
type "%LOG%"
echo.
pause
