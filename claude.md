# CLAUDE.md

## Project Overview

Multimodal AI hackathon project (Track A, see `Track A.pdf`): CardioVision predicts CAD and LAD/LCX/RCA stenosis
from the Z-Alizadeh Sani dataset and maps them onto an interactive 3D heart. Status and decisions: `progress.md`.

## Notes
- Python: `.venv/Scripts/python` (Git Bash) or `.venv\Scripts\python` (PowerShell). Never call bare `python` (Windows Store alias hangs).
- Write files with `encoding="utf-8"` (Windows default cp1252 breaks on symbols like ≥).
- Schema lives only in `src/cad/data.py`; UI labels/units in `src/cad/features_meta.py`. Never add targets to model inputs.
- Retrain: `scripts/train.py` (~9 min). Serve: `uvicorn cad.api:app --app-dir src --port 8000` (serves `frontend/dist`).
- Frontend: `cd frontend && npm run build` (or `npm run dev`, proxies /api to :8000). Anatomy is data in `frontend/src/anatomy/anatomy.ts`.
- Tests: `.venv/Scripts/python -m pytest -q`.
