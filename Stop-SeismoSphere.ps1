$ErrorActionPreference = 'Stop'
$health = Invoke-RestMethod -Uri 'http://127.0.0.1:4318/api/system/health' -TimeoutSec 3
if ($health.appId -ne 'seismosphere' -or $health.projectRoot -ne $PSScriptRoot) { throw 'The listener is not this SeismoSphere installation. No process was stopped.' }
$null = Invoke-RestMethod -Uri 'http://127.0.0.1:4318/api/system/shutdown' -Method Post -ContentType 'application/json' -Body '{}' -TimeoutSec 3
for ($attempt = 0; $attempt -lt 20; $attempt++) {
  Start-Sleep -Milliseconds 250
  if (-not (Get-NetTCPConnection -LocalPort 4318 -State Listen -ErrorAction SilentlyContinue)) { Write-Host 'SeismoSphere stopped. Saved research remains on disk.'; exit 0 }
}
throw 'Shutdown has not completed. Inspect the application logs before stopping a process manually.'
