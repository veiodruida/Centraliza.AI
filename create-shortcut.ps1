# create-shortcut.ps1
# Cria (ou atualiza) o atalho "Centraliza.ai" na Area de Trabalho do utilizador,
# apontando para o start.bat desta aplicacao.
# Pode ser re-executado a qualquer momento para recriar o atalho.
$ErrorActionPreference = 'Stop'

$appDir = if ($PSScriptRoot) { $PSScriptRoot } else { Split-Path -Parent $MyInvocation.MyCommand.Path }
$target = Join-Path $appDir 'start.bat'

if (-not (Test-Path $target)) {
    Write-Host "[ERRO] start.bat nao encontrado em $appDir" -ForegroundColor Red
    exit 1
}

$desktop = [Environment]::GetFolderPath('Desktop')
if (-not $desktop -or -not (Test-Path $desktop)) {
    $desktop = Join-Path $env:USERPROFILE 'Desktop'
}
if (-not (Test-Path $desktop)) {
    Write-Host '[ERRO] Nao foi possivel localizar a Area de Trabalho.' -ForegroundColor Red
    exit 1
}

$lnk = Join-Path $desktop 'Centraliza.ai.lnk'

try {
    $ws = New-Object -ComObject WScript.Shell
    $sc = $ws.CreateShortcut($lnk)
    $sc.TargetPath = $target
    $sc.WorkingDirectory = $appDir
    $sc.Description = 'Centraliza.ai - Orquestrador de IA Local'
    $sc.IconLocation = "$env:SystemRoot\System32\SHELL32.dll,220"
    $sc.Save()
    Write-Host "Atalho criado: $lnk" -ForegroundColor Green
} catch {
    Write-Host "[ERRO] Falha ao criar o atalho: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}
