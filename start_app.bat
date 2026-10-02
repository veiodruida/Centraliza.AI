@echo off
echo ===================================================
echo   Centraliza.ai V3.2 - Iniciar Aplicacao
echo ===================================================

echo [1/2] Iniciando Servidor Centralizado...
echo Abrindo o Dashboard no navegador: http://localhost:4000
start http://localhost:4000

:: Verificar e matar processo existente
for /f "tokens=2 delims= " %%a in ('tasklist /FI "IMAGENAME eq node.exe" /FO csv ^| findstr /i "server.js"') do (
    taskkill /F /PID %%a
)
timeout /t 2 /nobreak >nul
node server.js

pause
