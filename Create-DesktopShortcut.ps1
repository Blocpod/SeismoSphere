$ErrorActionPreference = 'Stop'
$desktopPath = [Environment]::GetFolderPath('Desktop')
$shortcutPath = Join-Path $desktopPath 'SeismoSphere AI.lnk'
$shell = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut($shortcutPath)
$launcher = Join-Path $PSScriptRoot 'Start-SeismoSphere.ps1'
if ((Test-Path -LiteralPath $shortcutPath) -and $shortcut.Arguments -notlike ('*' + $launcher + '*')) { throw 'A different SeismoSphere desktop shortcut exists. It has been left unchanged.' }
$shortcut.TargetPath = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
$shortcut.Arguments = '-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File "' + $launcher + '"'
$shortcut.WorkingDirectory = $PSScriptRoot
$shortcut.IconLocation = (Join-Path $PSScriptRoot 'public\seismosphere.ico') + ',0'
$shortcut.Description = 'Live Earth, local AI and your seismic research workspace'
$shortcut.WindowStyle = 7
$shortcut.Save()
Write-Output $shortcutPath
