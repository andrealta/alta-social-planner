@echo off
rem Cria (ou atualiza) a tarefa do Windows que roda a sincronizacao do
rem Operand uma vez por dia.
rem
rem O horario e 6h40 de proposito, e nao 6h ou 7h: horario redondo e
rem onde todo agendamento do mundo se acumula, e a maquina fica
rem disputando com backup, antivirus e atualizacao.
rem
rem A tarefa roda com a sua conta de usuario e so quando o computador
rem esta ligado. Se ele estiver desligado na hora, o Windows roda
rem assim que ligar de novo.
%SystemRoot%\System32\chcp.com 65001 >/dev/null 2>&1
cd /d "%~dp0"

set "NOME=Alta Social Planner - Operand"
set "ALVO=%~dp022-diario.cmd"

echo.
echo  Vou criar a tarefa: "%NOME%"
echo  Ela roda todo dia as 06:40 e chama:
echo     %ALVO%
echo.

schtasks /Create /TN "%NOME%" /TR "\"%ALVO%\"" /SC DAILY /ST 06:40 /F
if errorlevel 1 goto falhou

echo.
echo  Pronto. Para conferir, abra o Agendador de Tarefas do Windows e
echo  procure por "%NOME%".
echo.
echo  Para rodar agora mesmo, sem esperar amanha:
echo     schtasks /Run /TN "%NOME%"
echo.
echo  Para desfazer:
echo     schtasks /Delete /TN "%NOME%" /F
echo.
echo  O resultado de cada execucao fica em operand-diario.txt.
goto fim

:falhou
echo.
echo  Nao consegui criar a tarefa.
echo  Se a mensagem acima falar em acesso negado, abra este arquivo
echo  com o botao direito e escolha "Executar como administrador".

:fim
echo.
pause
