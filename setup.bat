@echo off
echo ===================================================
echo   CentralizaIA V2 - Setup de Instalacao
echo ===================================================

echo [1/2] Instalando dependencias do Root...
call npm install

echo [2/2] Instalando dependencias do Frontend...
cd frontend
call npm install
cd ..

echo.
echo ===================================================
echo   SETUP CONCLUIDO!
echo   Para rodar a app, use: start_app.bat
echo ===================================================
pause
