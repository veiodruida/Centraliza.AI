@echo off
echo ===================================================
echo   CentralizaIA V2 - Iniciar Aplicacao
echo ===================================================

echo [1/3] Verificando dependencias...
if not exist "node_modules" (
    echo Instalando dependencias do Backend...
    call npm install
)

cd frontend
if not exist "node_modules" (
    echo Instalando dependencias do Frontend...
    call npm install
)
cd ..

echo [2/3] Iniciando Backend Server (Porta 4000)...
start "CentralizaIA-Backend" cmd /k "node server.js"

echo [3/3] Iniciando Frontend Dashboard (Vite)...
cd frontend
start "CentralizaIA-Frontend" cmd /k "npm run dev"

echo.
echo ===================================================
echo   SISTEMA INICIADO!
echo   Interface: http://localhost:5173
echo   Backend: http://localhost:4000
echo ===================================================
pause
