@echo off
rem A rotina de todo dia: traz os jobs do Operand de todas as marcas
rem ligadas e refaz o retrato de producao de cada uma.
rem
rem Quem chama isto e a tarefa agendada do Windows, criada pelo
rem 21-agendar.cmd. Rodar na mao tambem funciona e nao atrapalha nada:
rem sincronizar e montar retrato sao idempotentes.
%SystemRoot%\System32\chcp.com 65001 >/dev/null 2>&1
cd /d "%~dp0"
set "LOG=%~dp0operand-diario.txt"
call node scripts/operand.mjs diario > "%LOG%" 2>&1
exit /b %ERRORLEVEL%
