@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion
cd /d "%~dp0"

echo ============================================
echo  Preparando o codigo para o GitHub
echo ============================================
echo.

where git >nul 2>&1
if errorlevel 1 (
  echo  ERRO: o Git nao esta instalado ou nao esta no caminho.
  echo  Instale em https://git-scm.com e rode de novo.
  pause
  exit /b 1
)

if not exist ".git" (
  echo  Criando o repositorio local...
  git init -b main
  echo.
)

git config user.name >nul 2>&1
if errorlevel 1 (
  echo  O Git precisa saber quem assina as alteracoes.
  echo.
  set "GNOME="
  set /p GNOME=  Seu nome: 
  set "GMAIL="
  set /p GMAIL=  Seu e-mail: 
  git config user.name "!GNOME!"
  git config user.email "!GMAIL!"
  echo.
)

echo  Selecionando os arquivos...
git add -A
echo.

call node scripts/git-seguro.mjs
if errorlevel 1 (
  echo.
  echo  PAREI AQUI de proposito. Nada foi enviado.
  pause
  exit /b 1
)

echo.
set "NOVIDADE=nao"
git commit -m "Alta Social Planner: atualizacao" >nul 2>&1
if errorlevel 1 (
  echo  Nenhuma alteracao nova para registrar.
) else (
  echo  Alteracoes registradas.
  set "NOVIDADE=sim"
)
echo.

git remote get-url origin >nul 2>&1
if errorlevel 1 (
  echo ============================================
  echo  Falta dizer para onde enviar.
  echo ============================================
  echo.
  echo  1. Abra github.com e crie um repositorio PRIVADO
  echo     chamado  alta-social-planner
  echo  2. NAO marque "Add README" nem ".gitignore".
  echo  3. Copie o endereco que aparece.
  echo.
  set "REPO="
  set /p REPO=  Cole o endereco aqui: 
  if "!REPO!"=="" (
    echo  Sem endereco. Rode de novo quando tiver.
    pause
    exit /b 1
  )
  git remote add origin "!REPO!"
  echo.
)

echo  Enviando... (pode abrir uma janela pedindo login do GitHub)
echo.

REM Guardamos a saida para saber se ALGO foi de fato enviado.
REM "Everything up-to-date" significa que o GitHub ja tinha tudo — e,
REM nesse caso, a Vercel nao recebe aviso nenhum e nao reconstroi.
git push -u origin main > "%TEMP%\asp-push.txt" 2>&1
set "FALHOU=%errorlevel%"
type "%TEMP%\asp-push.txt"
echo.

if not "%FALHOU%"=="0" (
  echo ============================================
  echo   O ENVIO FALHOU. Leia a mensagem acima.
  echo ============================================
  echo.
  echo   Se falou em autenticacao, faca o login que a janela
  echo   pediu e rode este arquivo de novo.
  pause
  exit /b 1
)

findstr /C:"Everything up-to-date" "%TEMP%\asp-push.txt" >nul
if errorlevel 1 (
  echo ============================================
  echo   ENVIADO. Havia novidade e ela subiu.
  echo ============================================
  echo.
  echo   A Vercel recebeu o aviso e vai publicar sozinha.
  echo   Leva uns dois minutos.
) else (
  echo ============================================
  echo   NADA FOI ENVIADO - o GitHub ja tinha tudo.
  echo ============================================
  echo.
  echo   Isto NAO e erro: seu codigo esta la, igualzinho.
  echo.
  echo   Mas tem uma consequencia: sem envio novo, a Vercel
  echo   nao recebe aviso e NAO publica nada. Se voce esta
  echo   esperando o site atualizar, ele nao vai.
  echo.
  echo   Para publicar sem mudar codigo, va na Vercel em
  echo   Deployments e use "Create Deployment" (ou o botao
  echo   de Redeploy, se ja houver alguma publicacao).
)
del "%TEMP%\asp-push.txt" >nul 2>&1
echo.
pause
