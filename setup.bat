@echo off
setlocal EnableExtensions EnableDelayedExpansion
title Centraliza.ai - Windows Setup
cd /d "%~dp0"
chcp 65001 >nul

set "CHECK_ONLY=0"
set "SILENT=0"
if /I "%~1"=="--check" set "CHECK_ONLY=1"
if /I "%~1"=="--silent" set "SILENT=1"

echo ===================================================
echo   Centraliza.ai - Windows Setup
echo ===================================================
echo.

echo [1/6] Checking Node.js (installs automatically if missing)...
if "%CHECK_ONLY%"=="1" (
    powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\install-node.ps1" -MinMajor 22 -MinMinor 5 -CheckOnly
) else (
    powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\install-node.ps1" -MinMajor 22 -MinMinor 5
)
if errorlevel 1 (
    echo.
    echo [ERROR] Node.js 22.5+ could not be installed automatically.
    echo         Install it manually from https://nodejs.org/ and run setup.bat again.
    if "%SILENT%"=="0" pause
    exit /b 1
)

:: Refresh PATH from the registry: winget may have installed Node outside this
:: terminal's original environment.
for /f "usebackq delims=" %%p in (`powershell -NoProfile -Command "[Environment]::GetEnvironmentVariable('Path','Machine') + ';' + [Environment]::GetEnvironmentVariable('Path','User')"`) do set "PATH=%%p"

set "NODE_DIR=%LOCALAPPDATA%\CentralizaAI\node"
if exist "%NODE_DIR%\node.exe" set "PATH=%NODE_DIR%;%PATH%"

:: Resolve npm.cmd to its full path: `call "npm"` can pick the extensionless
:: Unix shim in Node's folder, which does not work from cmd.exe.
set "NPM_CMD="
if exist "%NODE_DIR%\npm.cmd" set "NPM_CMD=%NODE_DIR%\npm.cmd"
if not defined NPM_CMD for /f "delims=" %%i in ('where npm.cmd 2^>nul') do set "NPM_CMD=%%i"
if not defined NPM_CMD (
    echo [ERROR] npm.cmd was not found. Reinstall Node.js and run setup.bat again.
    if "%SILENT%"=="0" pause
    exit /b 1
)

where node >nul 2>nul
if errorlevel 1 (
    echo [ERROR] Node.js is still not available in this terminal.
    echo         Close this window, open a new one and run setup.bat again.
    if "%SILENT%"=="0" pause
    exit /b 1
)
where npm.cmd >nul 2>nul
if errorlevel 1 (
    echo [ERROR] npm was not found next to Node.js.
    if "%SILENT%"=="0" pause
    exit /b 1
)
for /f "delims=" %%v in ('node -v') do set "NODE_VERSION=%%v"
echo         Node.js %NODE_VERSION% ready.
echo         npm: %NPM_CMD%

if "%CHECK_ONLY%"=="1" (
    echo [check] Node.js and npm are available.
    set "MISSING=0"
    if exist "node_modules\express" (echo [check] Root dependencies present.) else (echo [check] Root dependencies missing - run setup.bat.& set "MISSING=1")
    if exist "frontend\node_modules" (echo [check] Frontend dependencies present.) else (echo [check] Frontend dependencies missing - run setup.bat.& set "MISSING=1")
    if exist "frontend\dist\index.html" (echo [check] Frontend build present.) else (echo [check] Frontend build missing - run setup.bat.& set "MISSING=1")
    exit /b !MISSING!
)

echo.
echo [2/6] Installing root dependencies...
call "%NPM_CMD%" install --no-audit --no-fund
if errorlevel 1 (
    echo [ERROR] Could not install root dependencies.
    if "%SILENT%"=="0" pause
    exit /b 1
)

echo.
echo [3/6] Installing frontend dependencies...
pushd frontend
call "%NPM_CMD%" install --no-audit --no-fund
if errorlevel 1 (
    echo [ERROR] Could not install frontend dependencies.
    popd
    if "%SILENT%"=="0" pause
    exit /b 1
)
popd

echo.
echo [4/6] Building the interface...
pushd frontend
if exist dist rmdir /s /q dist
call "%NPM_CMD%" run build
if errorlevel 1 (
    echo [ERROR] The frontend build failed. See the errors above.
    popd
    if "%SILENT%"=="0" pause
    exit /b 1
)
popd

echo.
echo [5/6] Adding the 'central' command to PATH...
powershell -NoProfile -ExecutionPolicy Bypass -Command "$dir = (Get-Location).Path; $path = [Environment]::GetEnvironmentVariable('Path', 'User'); if (-not $path) { $path = '' }; if ($path -notlike '*'+$dir+'*') { [Environment]::SetEnvironmentVariable('Path', $path.TrimEnd(';') + ';' + $dir, 'User'); Write-Host 'Project folder added to PATH.' } else { Write-Host 'PATH already configured.' }"

echo.
echo [6/6] Creating the Desktop shortcut...
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0create-shortcut.ps1"

echo.
echo ===================================================
echo   SETUP COMPLETE!
echo.
echo   - Node.js and all dependencies are installed
echo   - The interface was built successfully
echo   - 'central' is available in new terminals
echo   - Desktop shortcut: Centraliza.ai
echo.
echo   Start the app with:
echo       setup and start: start.bat
echo       or the Desktop shortcut
echo       or the command: central
echo ===================================================
echo.
if "%SILENT%"=="1" exit /b 0
choice /c SN /m "Start Centraliza.ai now?"
if errorlevel 2 exit /b 0
call "%~dp0start.bat"
endlocal
