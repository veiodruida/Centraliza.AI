Add-Type -AssemblyName System.Windows.Forms
$f = New-Object System.Windows.Forms.FolderBrowserDialog
$f.Description = "Select a folder for CentralizaIA"
$f.ShowNewFolderButton = $true
$result = $f.ShowDialog((New-Object System.Windows.Forms.Form -Property @{TopMost = $true}))
if ($result -eq "OK") { 
    Write-Output $f.SelectedPath 
}
