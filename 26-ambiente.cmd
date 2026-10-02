@echo off
rem O chcp e chamado pelo caminho inteiro de proposito: chamado so pelo
rem nome ele as vezes nao e encontrado, e quando falha o console volta
rem para a tabela antiga e todo acento vira simbolo estranho.
%SystemRoot%\System32\chcp.com 65001 >nul 2>&1
cd /d "%~dp0"
call node scripts/onde.mjs
echo.
pause
