param([string]$Python = 'python')
$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath (Split-Path -Parent $PSScriptRoot)
if (-not (Test-Path -LiteralPath 'data\model-runtime\Scripts\python.exe')) {
    & $Python -m venv data\model-runtime
    if ($LASTEXITCODE -ne 0) { throw 'Python 3.10–3.14 is required. Pass its executable using -Python.' }
}
& '.\data\model-runtime\Scripts\python.exe' -m pip install -r model\requirements.txt
if ($LASTEXITCODE -ne 0) { throw 'Model dependency installation failed.' }
& '.\data\model-runtime\Scripts\python.exe' -c 'import torch, numpy; print("Local model ready", torch.__version__, numpy.__version__)'
if ($LASTEXITCODE -ne 0) { throw 'Model runtime verification failed.' }
