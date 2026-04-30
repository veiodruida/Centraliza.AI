@echo off
echo ===================================================
echo   Centraliza.ai V0.3.0 - Setup de Instalacao
echo ===================================================

echo [0/4] Liberando porta 4000...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :4000') do taskkill /f /pid %%a >nul 2>&1

echo [1/3] Instalando dependencias do Root...
call npm install

echo [2/3] Instalando dependencias do Frontend...
cd frontend
call npm install

echo [3/3] Compilando a interface (Build)...
call npm run build
if %errorlevel% neq 0 (
    echo.
    echo [ERRO] O build falhou! Verifique os erros acima.
    echo O servidor NAO sera iniciado com um build desatualizado.
    cd ..
    pause
    exit /b 1
)
cd ..

echo [4/4] Configurando comando 'central' no PATH...
powershell -NoProfile -Command "$dir = [System.IO.Path]::GetFullPath('.'); $path = [Environment]::GetEnvironmentVariable('Path', 'User'); if ($path -notlike '*'+$dir+'*') { [Environment]::SetEnvironmentVariable('Path', $path + ';' + $dir, 'User'); Write-Host 'Caminho adicionado ao PATH.' } else { Write-Host 'Caminho ja esta no PATH.' }"

echo.
echo ===================================================
echo   SETUP CONCLUIDO!
echo   Agora voce pode digitar 'central' em qualquer terminal.
echo   Iniciando a aplicacao...
echo ===================================================
call start_app.bat
