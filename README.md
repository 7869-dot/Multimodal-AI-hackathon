# CardioVision: coronary risk prediction mapped onto an interactive 3D heart

Multimodal AI Hackathon 2026, **Track A** (Cardiovascular Risk Visualization & Prediction).

CardioVision takes a patient's clinical, ECG, lab and echo features and predicts:
- overall coronary artery disease (`Cath`)
- stenosis of the **LAD**, **LCX** and **RCA**

It colors each artery, and its perfusion territory, on an interactive 3D heart by predicted probability. Every prediction comes with a SHAP explanation and a physiological breakdown.

> ⚠ **Decision-support and educational prototype only.** CardioVision does not diagnose, and it is not a substitute for coronary angiography or other formal diagnostic imaging.

## Quick start (Windows, PowerShell)

```powershell
# 1. Python env + models (training takes about 9 min: 5x10 repeated CV x 3 models x 4 targets)
python -m venv .venv
.venv\Scripts\python -m pip install -r requirements.txt
.venv\Scripts\python scripts\phase0_audit.py      # dataset audit  -> reports/phase0/
.venv\Scripts\python scripts\train.py             # CV + final fit -> models/, artifacts/, reports/phase1/

# 2. Frontend build (Node 20+)
cd frontend; npm install; npm run build; cd ..

# 3. Serve API + app on http://localhost:8000
.venv\Scripts\python -m uvicorn cad.api:app --app-dir src --port 8000
```

**Dev mode with hot reload:** run uvicorn as above, then run `cd frontend; npm run dev` and open http://localhost:5173. Vite proxies `/api` to port 8000.

**Tests:** `.venv\Scripts\python -m pytest -q`. They check for target leakage, SHAP additivity, input validation and API contracts.

## Results (5-fold stratified CV × 10 repeats, n = 303, out-of-sample)

| Target | Selected model | ROC-AUC | Accuracy | F1 | Prevalence |
|---|---|---|---|---|---|
| Overall CAD (`Cath`) | Logistic regression (L2) | **0.930 ± 0.033** | 0.864 | 0.899 | 71% |
| LAD | Random forest | **0.853 ± 0.038** | 0.787 | 0.821 | 58% |
| LCX | XGBoost | **0.743 ± 0.061** | 0.701 | 0.620 | 39% |
| RCA | Logistic regression (L2) | **0.731 ± 0.055** | 0.660 | 0.590 | 38% |

Full tables (precision, recall, Brier, every candidate model, and the prior baseline) are in `reports/phase1/evaluation.md` and in the app's **Model performance** tab.

## Repository layout

```
src/cad/data.py            schema, loading and normalization (single source of truth; leakage list)
src/cad/model.py           preprocessing, candidate models, SHAP Explainer (per original feature)
src/cad/features_meta.py   labels, units and normal ranges (drives the generated UI form)
src/cad/api.py             FastAPI: /api/predict, /schema, /metrics, /importance, /patients; serves the UI
scripts/phase0_audit.py    data audit report
scripts/train.py           repeated-CV evaluation, model selection, final fit, artifact export
models/*.joblib            trained pipelines (weights), one per target
artifacts/*.json           metrics, ROC/calibration curves, global importance, schema, demo patients
frontend/src/anatomy/      procedural heart surface, coronary tree and perfusion territories
frontend/src/components/   HeartScene (R3F), RiskPanel, Explanation (SHAP), PhysioTable, ModelPerformance
docs/                      project documentation (6 pages max) and demo video script
tests/                     pytest suite
```

## Extending the system
- **New clinical feature:** add the column to `FEATURE_GROUPS` in `data.py` and an entry in `features_meta.py`, then retrain. The form, API and SHAP views pick it up automatically.
- **New prediction target:** add it to `TARGETS` and `TARGET_META`, then retrain. The API registry loads any `models/<target>.joblib`.
- **New anatomical structure:** add a `VesselDef` to `CORONARY_TREE`, or a territory, in `frontend/src/anatomy/anatomy.ts`. It is defined in surface (u, v) coordinates, so it follows the heart automatically.

## Data and resources
- Extension of the Z-Alizadeh Sani dataset, UCI Machine Learning Repository (303 patients, 55 features plus 4 labels).
- The 3D anatomy is procedural (Three.js / React Three Fiber), so no external mesh license applies. The coronary course follows standard textbook anatomy, and the territories follow the conventional AHA LAD/LCX/RCA mapping.
