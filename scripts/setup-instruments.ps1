param([string]$Python = 'python')
$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath (Split-Path -Parent $PSScriptRoot)
if (-not (Test-Path -LiteralPath 'data\model-runtime\Scripts\python.exe')) {
    & $Python -m venv data\model-runtime
    if ($LASTEXITCODE -ne 0) { throw 'Python 3.12 is required. Pass its executable using -Python.' }
}
& '.\data\model-runtime\Scripts\python.exe' -m pip install --only-binary=:all: -r model\instrument-requirements.txt cryptography==50.0.1
if ($LASTEXITCODE -ne 0) { throw 'Local instrument dependency installation failed.' }
