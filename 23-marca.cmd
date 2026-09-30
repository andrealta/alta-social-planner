@echo off
rem Cria uma marca nova no planner: a linha da marca e o escopo
rem contratado. A base e preenchida depois, na tela da marca.
%SystemRoot%\System32\chcp.com 65001 >nul 2>&1
cd /d "%~dp0"
setlocal
set "LOG=%~dp0marca.txt"

echo.
echo  Marca nova no planner.
echo.
echo  O slug e o nome curto que aparece no endereco e nos comandos.
echo  Sem acento, sem espaco, minusculo. Exemplo: hero
echo.
set /p "SLUG=  Slug: "
set /p "NOME=  Nome como aparece na tela: "
set /p "SEG=  Segmento (ou Enter para deixar em branco): "
echo.
echo  Escopo contratado: quantas publicacoes de cada tipo por mes.
echo  Escreva Nome=quantidade, separado por virgula. Exemplo:
echo     Feed=8,Story=12,Reels=4
echo.
echo  Isso e restricao dura na geracao do planejamento: a IA fecha
echo  exatamente essas cotas. Da para rodar de novo depois e acrescentar.
echo.
set /p "ESCOPO=  Escopo (ou Enter para deixar para depois): "

echo.
call node scripts/marca-nova.mjs "%SLUG%" "%NOME%" "%SEG%" "%ESCOPO%" > "%LOG%" 2>&1
type "%LOG%"
echo.
pause
