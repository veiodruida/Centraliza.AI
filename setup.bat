@echo off
echo ===================================================
echo   Centraliza.ai V0.2.2 - Setup de Instalacao
echo ===================================================

echo [1/3] Instalando dependencias do Root...
call npm install

echo [2/3] Instalando dependencias do Frontend...
cd frontend
call npm install

echo [3/3] Compilando a interface (Build)...
call npm run build
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
