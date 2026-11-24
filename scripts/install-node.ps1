# Centraliza.ai - Node.js bootstrap for Windows
# Installs a supported Node.js LTS when the machine does not have one, without
# requiring the user to download anything manually. Tries winget/Chocolatey and
# falls back to the official portable Node.js ZIP (no administrator required).

param(
    [int]$MinMajor = 22,
    [int]$MinMinor = 5,
    [string]$InstallDir = "",
    [switch]$CheckOnly
)

$ErrorActionPreference = "Stop"
try { [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12 } catch { }

if (-not $InstallDir) {
    $base = if ($env:LOCALAPPDATA) { $env:LOCALAPPDATA } else { Join-Path $env:USERPROFILE "AppData\Local" }
    $InstallDir = Join-Path $base "CentralizaAI\node"
}

function Get-NodeVersion([string]$exe) {
    try {
        $value = & $exe -v 2>$null
        if ($value -and $value -match '^v(\d+)\.(\d+)') {
            return @{ Major = [int]$Matches[1]; Minor = [int]$Matches[2]; Raw = $value }
        }
    } catch { }
    return $null
}

function Test-SupportedNode([string]$exe) {
    if (-not $exe -or -not (Test-Path $exe)) { return $false }
    $v = Get-NodeVersion $exe
    if (-not $v) { return $false }
    return ($v.Major -gt $MinMajor) -or ($v.Major -eq $MinMajor -and $v.Minor -ge $MinMinor)
}

function Find-SupportedNode {
    $candidates = @()
    $cmd = Get-Command node -ErrorAction SilentlyContinue
    if ($cmd -and $cmd.Source) { $candidates += $cmd.Source }
    $portable = Join-Path $InstallDir "node.exe"
    if (Test-Path $portable) { $candidates += $portable }
    foreach ($candidate in $candidates) {
        if (Test-SupportedNode $candidate) { return $candidate }
    }
    return $null
}

function Add-ToUserPath([string]$dir) {
    $current = [Environment]::GetEnvironmentVariable("Path", "User")
    if (-not $current) { $current = "" }
    $parts = $current -split ';' | Where-Object { $_ -and $_.Trim() }
    if (-not ($parts | Where-Object { $_.TrimEnd('\') -ieq $dir.TrimEnd('\') })) {
        $newPath = if ($current.Trim()) { $current.TrimEnd(';') + ';' + $dir } else { $dir }
        [Environment]::SetEnvironmentVariable("Path", $newPath, "User")
    }
    $env:Path = $dir + ';' + $env:Path
}

function Refresh-Path {
    $machine = [Environment]::GetEnvironmentVariable("Path", "Machine")
    $user = [Environment]::GetEnvironmentVariable("Path", "User")
    $env:Path = (@($machine, $user) | Where-Object { $_ }) -join ';'
}

$existing = Find-SupportedNode
if ($existing) {
    Write-Host "[Node] Supported Node.js found: $existing ($(& $existing -v))"
    Write-Output $existing
    exit 0
}

if ($CheckOnly) {
    Write-Host "[Node] Node.js v$MinMajor.$MinMinor+ is required but was not found."
    exit 2
}

# 1) winget (bundled with Windows 10/11)
$winget = Get-Command winget -ErrorAction SilentlyContinue
if ($winget) {
    Write-Host "[Node] Trying winget (OpenJS.NodeJS.LTS)..."
    try {
        & winget install --id OpenJS.NodeJS.LTS -e --silent --accept-package-agreements --accept-source-agreements 2>&1 | Out-Host
    } catch { Write-Host "[Node] winget failed: $($_.Exception.Message)" }
    Refresh-Path
    $existing = Find-SupportedNode
    if ($existing) {
        Write-Host "[Node] Installed by winget: $existing ($(& $existing -v))"
        Write-Output $existing
        exit 0
    }
}

# 2) Chocolatey (if the user already uses it)
$choco = Get-Command choco -ErrorAction SilentlyContinue
if ($choco) {
    Write-Host "[Node] Trying Chocolatey (nodejs-lts)..."
    try { & choco install nodejs-lts -y --no-progress 2>&1 | Out-Host } catch { Write-Host "[Node] Chocolatey failed: $($_.Exception.Message)" }
    Refresh-Path
    $existing = Find-SupportedNode
    if ($existing) {
        Write-Host "[Node] Installed by Chocolatey: $existing ($(& $existing -v))"
        Write-Output $existing
        exit 0
    }
}

# 3) Official portable ZIP (no admin required)
Write-Host "[Node] Downloading the official Node.js 22 LTS portable package..."
$arch = switch ($env:PROCESSOR_ARCHITECTURE) {
    "ARM64" { "arm64" }
    "AMD64" { "x64" }
    "x86"   { "x86" }
    default { "x64" }
}
$listingUrl = "https://nodejs.org/dist/latest-v22.x/"
$listing = (Invoke-WebRequest -Uri $listingUrl -UseBasicParsing -TimeoutSec 90).Content
$file = [regex]::Match($listing, "node-v22[0-9.]+-win-$arch\.zip").Value
if (-not $file) { throw "Could not find a Node.js 22 Windows package for architecture '$arch'." }

$zip = Join-Path $env:TEMP $file
Write-Host "[Node] Downloading $file..."
Invoke-WebRequest -Uri ($listingUrl + $file) -OutFile $zip -UseBasicParsing -TimeoutSec 900

$tempDir = Join-Path $env:TEMP ("centraliza-node-" + [Guid]::NewGuid().ToString("N"))
Write-Host "[Node] Extracting..."
Expand-Archive -Path $zip -DestinationPath $tempDir -Force
$extracted = Get-ChildItem -Path $tempDir -Directory | Select-Object -First 1
if (-not $extracted) { throw "The Node.js package did not contain a folder." }

if (Test-Path $InstallDir) { Remove-Item -Path $InstallDir -Recurse -Force }
New-Item -ItemType Directory -Path (Split-Path $InstallDir) -Force | Out-Null
Move-Item -Path $extracted.FullName -Destination $InstallDir
Remove-Item -Path $tempDir -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item -Path $zip -Force -ErrorAction SilentlyContinue

Add-ToUserPath $InstallDir
$nodeExe = Join-Path $InstallDir "node.exe"
if (-not (Test-SupportedNode $nodeExe)) { throw "Node.js was extracted but does not run correctly: $nodeExe" }
Write-Host "[Node] Installed: $nodeExe ($(& $nodeExe -v))"
Write-Host "[Node] Node.js was added to your user PATH. New terminals will find it automatically."
Write-Output $nodeExe
exit 0
