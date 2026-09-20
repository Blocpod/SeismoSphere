# Run this reviewed setup script as Administrator when a phone cannot reach this PC.
$ErrorActionPreference = 'Stop'
$identity = [Security.Principal.WindowsIdentity]::GetCurrent()
$principal = New-Object Security.Principal.WindowsPrincipal($identity)
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
  throw 'Windows requires Administrator rights for its firewall. Right-click PowerShell, choose Run as administrator, then run this script.'
}
$status = Invoke-RestMethod -Uri 'http://127.0.0.1:4318/api/sharing/status' -TimeoutSec 5
if (-not $status.enabled) { throw 'First enable Phone access in SeismoSphere Settings.' }
$shareAddress = [string]$status.settings.host
if (-not (Get-NetIPAddress -AddressFamily IPv4 | Where-Object IPAddress -eq $shareAddress)) { throw 'The app address is not a current local interface.' }
$sharePorts = @([int]$status.settings.port, [int]$status.settings.bootstrapPort)
if ($sharePorts.Count -ne 2 -or ($sharePorts | Where-Object { $_ -lt 1024 -or $_ -gt 65535 -or $_ -eq 4318 })) { throw 'Unexpected port configuration.' }
$ruleName = 'SeismoSphere-Private-LAN'
$existing = Get-NetFirewallRule -Name $ruleName -ErrorAction SilentlyContinue
if ($existing) {
  $existing | Set-NetFirewallRule -Enabled True -Direction Inbound -Action Allow -Profile Any -RemoteAddress LocalSubnet -LocalAddress $shareAddress
  $existing | Get-NetFirewallPortFilter | Set-NetFirewallPortFilter -Protocol TCP -LocalPort $sharePorts
} else {
  New-NetFirewallRule -Name $ruleName -DisplayName 'SeismoSphere private phone access' -Description 'Local-subnet clients only. HTTPS workspace plus public certificate setup page. Desktop port 4318 stays loopback.' -Enabled True -Direction Inbound -Action Allow -Profile Any -Protocol TCP -LocalPort $sharePorts -LocalAddress $shareAddress -RemoteAddress LocalSubnet | Out-Null
}
Write-Host "Ready for phone testing: $($status.setupUrl)"
Write-Host 'To remove this rule later: Remove-NetFirewallRule -Name SeismoSphere-Private-LAN'
