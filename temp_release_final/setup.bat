@echo off
setlocal

echo ===================================================
echo   Centraliza.ai V3.2 - Setup de Instalacao
echo ===================================================

:: Check for Node.js
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERRO] Node.js nao encontrado! Instale em: https://nodejs.org/
    pause
    exit /b 1
)

echo.
echo [1/4] Instalando dependencias do Root...
call npm install --no-audit --no-fund
if %errorlevel% neq 0 (
    echo [ERRO] Falha ao instalar dependencias do Root!
    pause
    exit /b 1
)

echo [2/4] Instalando dependencias do Frontend...
cd frontend
call npm install --no-audit --no-fund
if %errorlevel% neq 0 (
    echo [ERRO] Falha ao instalar dependencias do Frontend!
    cd ..
    pause
    exit /b 1
)

echo [3/4] Compilando a interface (Build)...
call npm run build
if %errorlevel% neq 0 (
    echo [ERRO] O build falhou! Verifique os erros acima.
    cd ..
    pause
    exit /b 1
)
cd ..

echo [4/4] Configurando PATH...
powershell -NoProfile -Command "$dir = [System.IO.Path]::GetFullPath('.'); $path = [Environment]::GetEnvironmentVariable('Path', 'User'); if ($path -notlike '*'+$dir+'*') { [Environment]::SetEnvironmentVariable('Path', $path + ';' + $dir, 'User'); Write-Host 'Caminho adicionado.' } else { Write-Host 'Caminho ja existe.' }"

echo.
echo ===================================================
echo   SETUP CONCLUIDO!
echo   Digite 'npm start' ou use 'start_app.bat'.
echo ===================================================
timeout /t 5
call start_app.bat
