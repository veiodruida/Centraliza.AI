param([string]$initialPath)

$ErrorActionPreference = 'SilentlyContinue'
Add-Type -AssemblyName System.Windows.Forms
Add-Type @"
  using System;
  using System.Runtime.InteropServices;
  public class Win32 {
    [DllImport("user32.dll")]
    [return: MarshalAs(UnmanagedType.Bool)]
    public static extern bool SetForegroundWindow(IntPtr hWnd);
  }
"@

$f = New-Object System.Windows.Forms.FolderBrowserDialog
$f.Description = "Select a folder for Centraliza.ai"
$f.ShowNewFolderButton = $true

if ($initialPath -and (Test-Path $initialPath)) {
    $f.SelectedPath = $initialPath
}

# Create a hidden form to act as parent and bring it to front
$form = New-Object System.Windows.Forms.Form
$form.TopMost = $true
$form.Width = 0
$form.Height = 0
$form.WindowState = 'Minimized'
$form.Show()
[Win32]::SetForegroundWindow($form.Handle)

$result = $f.ShowDialog($form)
if ($result -eq "OK") { 
    Write-Output $f.SelectedPath 
}
$form.Close()
