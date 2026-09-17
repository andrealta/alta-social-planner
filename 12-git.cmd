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
git commit -m "Alta Social Planner: sistema completo (base, geracao, calendario, conteudo, portal do cliente, pessoas)" >nul 2>&1
if errorlevel 1 (
  echo  Nada novo para registrar desde a ultima vez. Seguindo.
) else (
  echo  Alteracoes registradas.
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
  echo  2. NAO marque nenhuma opcao de "Add README" ou
  echo     ".gitignore" - o projeto ja tem os dele.
  echo  3. Copie o endereco que aparece, algo como
  echo     https://github.com/seu-usuario/alta-social-planner.git
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
git push -u origin main
if errorlevel 1 (
  echo.
  echo  O envio falhou. Leia a mensagem acima.
  echo  Se falou em autenticacao, faca o login que a janela pediu
  echo  e rode este arquivo de novo.
) else (
  echo.
  echo ============================================
  echo   Enviado. O codigo esta no GitHub.
  echo ============================================
)
echo.
pause
