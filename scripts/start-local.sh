#!/usr/bin/env bash
set -euo pipefail
task_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$task_root"
python3 -m venv .venv
.venv/bin/python -m pip install -r backend/requirements.txt
cd frontend
npm ci --no-audit --no-fund
npm run build
cd ../backend
echo 'Connected workspace: http://127.0.0.1:8000'
echo 'Generated key: backend/data/access-token.txt (unless set in environment).'
exec ../.venv/bin/python -m uvicorn app.main:app --host 127.0.0.1 --port 8000
