param([switch]$NoBrowser)
$ErrorActionPreference = 'Stop'
$projectRoot = $PSScriptRoot
$nodeCommand = Get-Command node -ErrorAction SilentlyContinue
if ($nodeCommand) { $nodeExe = $nodeCommand.Source } else {
  $nodeExe = Join-Path $env:USERPROFILE '.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe'
}
if (-not (Test-Path -LiteralPath $nodeExe)) { throw 'Node.js 24 or later is required. Install it, then launch again.' }
$nodeVersion = & $nodeExe --version
if ($LASTEXITCODE -ne 0 -or [int]($nodeVersion.TrimStart('v').Split('.')[0]) -lt 24) { throw 'This installation requires Node.js 24 or later.' }
$requiredAssets = @('public\assets\earth-8k.jpg','public\assets\slab2-depth.json','public\assets\gem-faults.json','public\vendor\three.module.js','public\vendor\qrcode.mjs')
if ($requiredAssets | Where-Object { -not (Test-Path -LiteralPath (Join-Path $projectRoot $_)) }) {
  Push-Location -LiteralPath $projectRoot
  try { & $nodeExe 'scripts/setup.mjs'; if ($LASTEXITCODE -ne 0) { throw 'Asset setup failed. Check the internet connection and retry.' } } finally { Pop-Location }
}
$appPort = 4318
try {
  $appStatus = Invoke-RestMethod -Uri "http://127.0.0.1:$appPort/api/system/health" -TimeoutSec 2
  if ($appStatus.appId -ne 'seismosphere' -or $appStatus.projectRoot -ne $projectRoot) { throw 'Port is occupied by another application.' }
} catch {
  if (Get-NetTCPConnection -LocalPort $appPort -State Listen -ErrorAction SilentlyContinue) { throw "Port $appPort is already occupied by another application." }
  $logDir = Join-Path $projectRoot 'logs'
  New-Item -ItemType Directory -Force -Path $logDir | Out-Null
  Start-Process -FilePath $nodeExe -ArgumentList 'server/index.mjs' -WorkingDirectory $projectRoot -WindowStyle Hidden -RedirectStandardOutput (Join-Path $logDir 'server.log') -RedirectStandardError (Join-Path $logDir 'server-error.log')
  $ready = $false
  for ($attempt = 0; $attempt -lt 30; $attempt++) {
    Start-Sleep -Milliseconds 500
    try { $health = Invoke-RestMethod -Uri "http://127.0.0.1:$appPort/api/system/health" -TimeoutSec 2; if ($health.appId -eq 'seismosphere' -and $health.projectRoot -eq $projectRoot) { $ready = $true; break } } catch { }
  }
  if (-not $ready) { throw "Server did not start. Check $logDir\server-error.log" }
}
if (-not $NoBrowser) {
  # Start the user's installed local inference service when it is not already available.
  try { $null = Invoke-RestMethod 'http://127.0.0.1:11434/api/tags' -TimeoutSec 2 } catch {
    $ollamaCommand = Get-Command ollama -ErrorAction SilentlyContinue
    if ($ollamaCommand) { Start-Process -FilePath $ollamaCommand.Source -ArgumentList 'serve' -WindowStyle Hidden }
  }
  try { $null = Invoke-RestMethod -Uri "http://127.0.0.1:$appPort/api/refresh" -Method Post -ContentType 'application/json' -Body '{}' -TimeoutSec 15 } catch { Write-Warning 'The workspace will show its saved catalog while synchronization retries.' }
  $appBrowser = @((Join-Path ${env:ProgramFiles(x86)} 'Microsoft\Edge\Application\msedge.exe'),(Join-Path $env:ProgramFiles 'Google\Chrome\Application\chrome.exe')) | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
  if ($appBrowser) {
    $profile = Join-Path $projectRoot 'data\desktop-browser'
    Start-Process -FilePath $appBrowser -ArgumentList @("--app=http://127.0.0.1:$appPort", ('--user-data-dir="' + $profile + '"'), '--no-first-run')
  } else { Start-Process "http://127.0.0.1:$appPort" }
}
