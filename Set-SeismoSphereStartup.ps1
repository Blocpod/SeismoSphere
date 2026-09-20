param([ValidateSet('Status','Enable','Disable')][string]$Mode = 'Status')
$ErrorActionPreference = 'Stop'
$key = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Run'
$entryName = 'SeismoSphere'
$shellExe = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
$launchScript = Join-Path $PSScriptRoot 'Start-SeismoSphere.ps1'
$expected = '"' + $shellExe + '" -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File "' + $launchScript + '" -NoBrowser'
$current = $null
if (Test-Path -LiteralPath $key) { $registryKey = Get-Item -LiteralPath $key; $current = $registryKey.GetValue($entryName, $null) }
if ($current -and $current -ne $expected -and $Mode -ne 'Status') { throw 'A different SeismoSphere startup entry exists. Review that entry before replacing it.' }
if ($Mode -eq 'Enable') { New-ItemProperty -LiteralPath $key -Name $entryName -Value $expected -PropertyType String -Force | Out-Null; $current = $expected }
if ($Mode -eq 'Disable' -and $current -eq $expected) { Remove-ItemProperty -LiteralPath $key -Name $entryName; $current = $null }
[PSCustomObject]@{enabled=($current -eq $expected);conflict=([bool]$current -and $current -ne $expected);scope='Current Windows user; starts hidden at sign-in'} | ConvertTo-Json -Compress
