param([string]$Python = 'python')
$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath (Split-Path -Parent $PSScriptRoot)
if (-not (Test-Path -LiteralPath 'data\model-runtime\Scripts\python.exe')) {
    & $Python -m venv data\model-runtime
    if ($LASTEXITCODE -ne 0) { throw 'Python 3.10–3.12 is required. Pass its executable using -Python.' }
}
& '.\data\model-runtime\Scripts\python.exe' -m pip install -r model\speech-requirements.txt
if ($LASTEXITCODE -ne 0) { throw 'Local speech dependency installation failed.' }
& '.\data\model-runtime\Scripts\python.exe' scripts\setup-speech.py
if ($LASTEXITCODE -ne 0) { throw 'Local speech model download or verification failed.' }
