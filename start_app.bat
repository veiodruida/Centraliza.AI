@echo off
echo ===================================================
echo   Centraliza.ai V0.3.0 - Iniciar Aplicacao
echo ===================================================

echo [1/2] Iniciando Servidor Centralizado...
echo Abrindo o Dashboard no navegador: http://localhost:4000
start http://localhost:4000

node server.js > server.log 2>&1

pause
