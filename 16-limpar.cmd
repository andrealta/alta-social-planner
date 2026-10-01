@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo.
echo  Apagando o arquivo orfao da tela de cor da marca.
echo.
echo  Ele ficou para tras quando a escolha de cor mudou para a tela de
echo  cadastro da marca. Nao e mais importado por ninguem, e a partir
echo  da rodada 86 a funcao que ele chamava tambem deixou de existir:
echo  deixa-lo no lugar quebraria a compilacao.
echo.
set "ALVO=src\app\painel\marca\[slug]\cor.tsx"
set "COPIA=_espelho\src__app__painel__marca__[slug]__cor.tsx"
if exist "%ALVO%" (del /q "%ALVO%" & echo  apagado: %ALVO%) else (echo  ja nao existia: %ALVO%)
if exist "%COPIA%" (del /q "%COPIA%" & echo  apagado: %COPIA%) else (echo  ja nao existia: %COPIA%)
echo.
pause
