# Progress Log

_Last updated: 2026-10-08_

## Project
Multimodal AI Hackathon 2026, **Track A**: CardioVision, an interactive 3D cardiovascular risk visualization and prediction app.
- It predicts overall CAD (`Cath`) and LAD/LCX/RCA stenosis.
- `LAD`, `LCX`, `RCA` and `Cath` are never model inputs (enforced by a test).
- Judging weights: Predictive 30%, 3D Viz 25%, Interpretability 20%, Integration 15%, Tech 10%.

## Status: all phases built and verified; only the video recording remains
| Phase | Status | Output |
|---|---|---|
| 0. Data audit | ✅ | `scripts/phase0_audit.py` → `reports/phase0/audit.md/json` |
| 1. Models + CV | ✅ | `scripts/train.py` → `models/*.joblib`, `artifacts/*.json`, `reports/phase1/evaluation.md` |
| 2. SHAP | ✅ | `src/cad/model.py::Explainer`; additivity tested |
| 3. Backend | ✅ | `src/cad/api.py` (FastAPI; also serves `frontend/dist`) |
| 4. Frontend + 3D | ✅ | `frontend/` (React 19, R3F, procedural heart in `src/anatomy/anatomy.ts`) |
| 5. Docs | ✅ | `README.md`, `docs/DOCUMENTATION.md`, `docs/DEMO_SCRIPT.md` |
| 5b. Demo video | ⏳ TODO (user) | Record following `docs/DEMO_SCRIPT.md`, then upload to YouTube |
| Tests | ✅ | `tests/test_pipeline.py`: 7 passed |

## Decisions made (defaults chosen without asking; revisit if desired)
- **Cath kept as given.** The 1 inconsistent row (93: LAD stenotic, Cath Normal) is not relabeled.
- **Dropped only `Exertional CP`** (constant). Rare binaries are kept.
- **Outliers kept** (clinically plausible).
- **Validation:** 5-fold stratified × 10 repeats. Candidates are LogReg (inner-CV C), random forest and XGBoost. The model with the best mean AUC is selected per target. Threshold 0.5.
- **Stack:** FastAPI + scikit-learn/XGBoost/SHAP; Vite + React + TypeScript + React Three Fiber.
- **3D:** procedural heart rather than a downloaded mesh. This gives exact LAD/LCX/RCA correspondence, no license issues and no GPU requirement.

## Results (CV ROC-AUC)
- Cath 0.930 (LogReg)
- LAD 0.853 (random forest)
- LCX 0.743 (XGBoost)
- RCA 0.731 (LogReg)

## How to run
See README.md. In short:
1. Run `train.py`.
2. Build the frontend with `npm run build` in `frontend/`.
3. Start the server with `uvicorn cad.api:app --app-dir src --port 8000`.

## Possible next steps
- Record the demo video.
- Optional: `git init` and the first commit (the folder is not a git repo yet).
- Optional: probability calibration (Platt/isotonic, nested), an ensemble per target, a multi-label classifier chain using vessel co-occurrence, or swapping in a BodyParts3D heart mesh as an extra anatomical layer.
