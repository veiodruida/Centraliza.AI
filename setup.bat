@echo off
echo ===================================================
echo   Centraliza.ai V2 - Setup de Instalacao
echo ===================================================

echo [1/3] Instalando dependencias do Root...
call npm install

echo [2/3] Instalando dependencias do Frontend...
cd frontend
call npm install

echo [3/3] Compilando a interface (Build)...
call npm run build
cd ..

echo.
echo ===================================================
echo   SETUP CONCLUIDO!
echo   Iniciando a aplicacao...
echo ===================================================
call start_app.bat
