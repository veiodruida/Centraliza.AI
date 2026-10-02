@echo off
setlocal
title Centraliza.ai - Iniciar Aplicacao
cd /d "%~dp0"
chcp 65001 >nul

echo ===================================================
echo   Centraliza.ai - Iniciar Aplicacao
echo ===================================================
echo.

:: 1) Node.js presente?
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERRO] Node.js nao encontrado. Instale em: https://nodejs.org/
    echo        e execute o setup.bat novamente.
    pause
    exit /b 1
)

:: 2) Dependencias e interface compilada? (senao, indica o setup)
if not exist "%~dp0node_modules\express" goto :needSetup
if not exist "%~dp0frontend\node_modules" goto :needSetup
if not exist "%~dp0frontend\dist\index.html" goto :needSetup
goto :run

:needSetup
echo [AVISO] A instalacao parece incompleta (dependencias ou interface em falta).
echo         Execute o setup.bat uma vez para instalar e compilar tudo.
echo.
choice /c SN /m "Executar o setup.bat agora?"
if %errorlevel%==1 (
    call "%~dp0setup.bat"
    if %errorlevel% neq 0 ( echo. & echo [ERRO] O setup falhou. & pause & exit /b 1 )
) else (
    echo.
    echo Abortado. Execute setup.bat manualmente.
    pause
    exit /b 1
)

:run
:: 3) Encerrar qualquer instancia anterior na porta 4000 (evita EADDRINUSE)
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":4000 " ^| findstr "LISTENING"') do (
    taskkill /F /PID %%a >nul 2>nul
)

:: 4) Abrir o dashboard no browser
start "" "http://localhost:4000"

:: 5) Iniciar o servidor nesta janela (fechar a janela para parar a app)
echo.
echo A iniciar o servidor em http://localhost:4000 ...
echo Para parar a aplicacao, feche esta janela.
echo.
node server.js

echo.
echo O servidor terminou.
pause
endlocal
