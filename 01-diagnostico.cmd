@echo off
chcp 65001 >nul
setlocal
set "LOG=%~dp0diagnostico.txt"

echo ============================================ > "%LOG%"
echo  Alta Social Planner - diagnostico do ambiente >> "%LOG%"
echo  %DATE% %TIME% >> "%LOG%"
echo ============================================ >> "%LOG%"
echo. >> "%LOG%"

echo [pasta do projeto] >> "%LOG%"
echo %~dp0 >> "%LOG%"
echo. >> "%LOG%"

echo [node] >> "%LOG%"
node --version >> "%LOG%" 2>&1
echo. >> "%LOG%"

echo [npm] >> "%LOG%"
call npm --version >> "%LOG%" 2>&1
echo. >> "%LOG%"

echo [git] >> "%LOG%"
git --version >> "%LOG%" 2>&1
echo. >> "%LOG%"

echo [acesso ao registro do npm] >> "%LOG%"
call npm ping >> "%LOG%" 2>&1
echo. >> "%LOG%"

echo [versoes atuais dos pacotes que vamos usar] >> "%LOG%"
echo -- next: >> "%LOG%"
call npm view next version >> "%LOG%" 2>&1
echo -- react: >> "%LOG%"
call npm view react version >> "%LOG%" 2>&1
echo -- react-dom: >> "%LOG%"
call npm view react-dom version >> "%LOG%" 2>&1
echo -- typescript: >> "%LOG%"
call npm view typescript version >> "%LOG%" 2>&1
echo -- drizzle-orm: >> "%LOG%"
call npm view drizzle-orm version >> "%LOG%" 2>&1
echo -- drizzle-kit: >> "%LOG%"
call npm view drizzle-kit version >> "%LOG%" 2>&1
echo -- @supabase/supabase-js: >> "%LOG%"
call npm view @supabase/supabase-js version >> "%LOG%" 2>&1
echo -- @supabase/ssr: >> "%LOG%"
call npm view @supabase/ssr version >> "%LOG%" 2>&1
echo -- postgres: >> "%LOG%"
call npm view postgres version >> "%LOG%" 2>&1
echo. >> "%LOG%"

echo ============================================ >> "%LOG%"
echo  fim >> "%LOG%"
echo ============================================ >> "%LOG%"

echo.
echo  Pronto.
echo.
echo  O arquivo  diagnostico.txt  foi criado nesta pasta.
echo  Pode fechar esta janela e me avisar.
echo.
pause
