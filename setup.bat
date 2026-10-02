@echo off
setlocal
title Centraliza.ai - Setup de Instalacao
cd /d "%~dp0"
chcp 65001 >nul

echo ===================================================
echo   Centraliza.ai - Setup de Instalacao
echo ===================================================
echo.

:: 1) Node.js presente?
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERRO] Node.js nao encontrado! Instale em: https://nodejs.org/
    pause
    exit /b 1
)

echo [1/5] Instalando dependencias do Root...
call npm install --no-audit --no-fund
if %errorlevel% neq 0 (
    echo [ERRO] Falha ao instalar dependencias do Root!
    pause
    exit /b 1
)

echo [2/5] Instalando dependencias do Frontend...
pushd frontend
call npm install --no-audit --no-fund
if %errorlevel% neq 0 (
    echo [ERRO] Falha ao instalar dependencias do Frontend!
    popd
    pause
    exit /b 1
)
popd

echo [3/5] Compilando a interface (Build)...
pushd frontend
if exist dist rmdir /s /q dist
call npm run build
if %errorlevel% neq 0 (
    echo [ERRO] O build falhou! Verifique os erros acima.
    popd
    pause
    exit /b 1
)
popd

echo [4/5] Configurando PATH (comando 'central')...
powershell -NoProfile -ExecutionPolicy Bypass -Command "$dir = (Get-Location).Path; $path = [Environment]::GetEnvironmentVariable('Path', 'User'); if ($path -notlike '*'+$dir+'*') { [Environment]::SetEnvironmentVariable('Path', $path + ';' + $dir, 'User'); Write-Host 'Caminho adicionado ao PATH.' } else { Write-Host 'PATH ja configurado.' }"

echo [5/5] Criando atalho na Area de Trabalho...
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0create-shortcut.ps1"

echo.
echo ===================================================
echo   INSTALACAO CONCLUIDA COM SUCESSO!
echo.
echo   - Atalho criado na Area de Trabalho: Centraliza.ai
echo   - Comando 'central' disponivel no PATH
echo   - Formas de iniciar a aplicacao:
echo       . atalho "Centraliza.ai" no Ambiente de Trabalho
echo       . comando  central
echo       . script   start.bat
echo ===================================================
echo.
choice /c SN /m "Iniciar a aplicacao agora?"
if %errorlevel%==1 call "%~dp0start.bat"
endlocal
