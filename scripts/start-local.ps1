$ErrorActionPreference = 'Stop'
$taskRoot = Split-Path -Parent $PSScriptRoot
Set-Location $taskRoot
if (!(Test-Path '.venv')) { python -m venv .venv }
& .\.venv\Scripts\python.exe -m pip install -r backend\requirements.txt
Set-Location frontend
& npm ci --no-audit --no-fund
& npm run build
Set-Location ..\backend
Write-Host 'Connected workspace will be available at http://127.0.0.1:8000'
Write-Host 'Connection key is generated at backend/data/access-token.txt (unless configured in environment).'
& ..\.venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8000
