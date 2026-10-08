# CardioVision: project documentation
Multimodal AI Hackathon 2026, Track A: Cardiovascular Risk Visualization & Prediction

## 1. Overview
CardioVision is a web application that predicts:
- **overall coronary artery disease (CAD)**
- **stenosis (≥50% narrowing) of the LAD, LCX and RCA**

It makes these predictions from routine clinical data, then maps them onto an interactive 3D heart. Each artery is colored by its predicted probability, and so is the myocardial territory it supplies. A clinical dashboard shows:
- the overall CAD status
- the per-vessel probabilities
- a SHAP explanation of *why* each score is high or low
- every physiological measurement next to its normal range and its contribution

Every view carries a visible disclaimer: the tool is for decision support and education only, and it is not a substitute for angiography or other formal diagnostic imaging.

```
 Excel dataset ─► data.py (schema, normalize) ─► train.py (5×10 repeated CV, 3 models × 4 targets)
                                                      │ models/*.joblib + artifacts/*.json
 Browser (React + R3F) ◄── JSON ── FastAPI (api.py): /predict = 4 pipelines + SHAP explainers
   form ─► debounce ─► POST /api/predict ─► probabilities ─► 3D colors, gauge, SHAP, physiology table
```

## 2. Dataset and preprocessing
**Source.** The Extension of the Z-Alizadeh Sani dataset (UCI) has 303 patients and 55 clinical features in 7 groups:
- demographics
- history and risk factors
- physical exam
- symptoms
- ECG
- labs
- echocardiography

It has 4 labels: `Cath` (CAD vs Normal) and LAD/LCX/RCA (Stenotic vs Normal). The workbook's second sheet is an empty template and is ignored.

**Audit** (`scripts/phase0_audit.py` → `reports/phase0/audit.md`):
- **Data quality:**
  - No missing values and no duplicate rows.
  - BMI matches Weight/Height² exactly.
  - Smoking status and chest-pain types are mutually consistent.
  - Lymph + Neut ≤ 100.
- **Class balance:** Cath 71% positive, LAD 58%, LCX 39%, RCA 38%.
- **Label structure:** `Cath` is positive exactly when at least one vessel is stenotic, with **one exception** (row 93: LAD stenotic, Cath = Normal). Vessel disease co-occurs heavily: 87 patients have 1 diseased vessel, 67 have 2 and 63 have 3.
- **Constant and rare features:** `Exertional CP` is constant, so it is dropped. Several binaries are very rare (CHF n=1, LowTH Ang n=2). They are kept, because the models are regularized or tree-based.
- **Outliers:** Extreme but clinically possible values (TG 1050, FBS 400, PLT 25) are kept unchanged.
- **Leakage screen:** We computed univariate tests (χ²/φ for binary features, Mann–Whitney/AUC for continuous ones) for every feature × target pair. No feature is near-perfectly predictive. The strongest is typical chest pain vs CAD (φ = 0.54).

**Decisions.**
- `Cath` is kept as given in the dataset. The brief defines overall CAD "according to the dataset definition", and one label disagreement does not justify relabeling.
- **Target leakage is prevented by construction.** `LAD`, `LCX`, `RCA` and `Cath` are never model inputs for any target. `data.LEAKAGE_COLUMNS` is excluded from `MODEL_FEATURES`, and a unit test asserts it.

**Encoding.**
- Y/N flags → 0/1, `Sex` → 1/0 (the source spells female as "Fmale").
- `VHD` → ordinal 0–3; `Function Class` and `Region RWMA` stay ordinal.
- `BBB` (N/LBBB/RBBB) → one-hot.
- Continuous features are standardized for logistic regression only. The scaler is fit inside each CV fold.
- `normalize()` raises an error on any unknown category code, so bad input can never silently become NaN.

## 3. Models and validation
**Candidates (per target).**
1. **Logistic regression** (L2, class-balanced). C ∈ {0.01…1} is tuned by an *inner* 5-fold CV.
2. **Random forest**: 400 trees, depth ≤ 6, min leaf 3, balanced.
3. **XGBoost**: 300 depth-2 trees, learning rate 0.05, subsampling, L2 penalty, `scale_pos_weight`.

All three are deliberately conservative for n = 303.

**Validation.** We use **5-fold stratified CV repeated 10 times** (50 folds per model per target), so there is no single lucky hold-out split. The whole pipeline (scaling, encoding, inner tuning) is refit inside every fold.

We report mean ± SD across folds for accuracy, precision, recall, F1, ROC-AUC and the Brier score, at a 0.5 threshold. A prior-probability baseline is included. Out-of-fold predictions, averaged over repeats, give the pooled ROC curve, calibration curve and confusion matrix.

The model with the best mean ROC-AUC is selected per target and refit on all 303 patients. Selecting among only 3 candidates adds a small optimistic bias, which we note but expect to be minor.

**Results** (5-fold CV × 10 repeats, mean ± SD):

| Target | Model | ROC-AUC | Accuracy | Precision | Recall | F1 | Brier |
|---|---|---|---|---|---|---|---|
| CAD | LogReg | **0.930 ± 0.033** | 0.864 | 0.944 | 0.861 | 0.899 | 0.124 |
| LAD | Random forest | **0.853 ± 0.038** | 0.787 | 0.808 | 0.839 | 0.821 | 0.169 |
| LCX | XGBoost | **0.743 ± 0.061** | 0.701 | 0.623 | 0.626 | 0.620 | 0.205 |
| RCA | LogReg | **0.731 ± 0.055** | 0.660 | 0.543 | 0.658 | 0.590 | 0.210 |
| *(prior baseline)* | — | 0.500 | 0.584–0.713 | — | — | — | 0.205–0.243 |

**How to read these numbers.**
- **Overall CAD** is predicted well. This agrees with published results on this dataset, and symptoms, age and ECG/echo findings carry strong signal.
- **LAD** is the most predictable vessel. RWMA and reduced ejection fraction reflect the anterior territory that the LAD supplies.
- **LCX and RCA** are harder. Routine clinical features carry little *location-specific* information, and their AUCs (0.73–0.74) are honest, cross-validated values.
- **Calibration** (Brier score, calibration plot in the app) is reasonable for all selected models. Logistic regression is class-balanced, so its probabilities shift toward 50%; the Brier score reflects this.

**Most influential features** (global mean |SHAP|):
- CAD: typical chest pain, age, atypical chest pain, T-wave inversion, hypertension, RWMA
- LAD: typical chest pain, RWMA, EF, age
- LCX: age, typical chest pain, triglycerides, creatinine
- RCA: diabetes, typical chest pain, age, sex

## 4. Explainability
- **Method.** Each prediction is explained with **SHAP**:
  - `LinearExplainer` for logistic regression (exact, in log-odds, with the training data as background)
  - `TreeExplainer` for XGBoost (exact, in log-odds) and for the random forest (path-dependent, in probability)

  Contributions to one-hot columns are summed back onto the original feature, so the user only sees clinical variable names.
- **Exact additivity.** Baseline + Σ contributions reproduces each model's predicted probability exactly (after the sigmoid for log-odds models). A unit test checks this for all four models.
- **Dashboard views:**
  - **Why this risk?**: a plain-language summary (the top factors raising and lowering risk, with patient values), a SHAP waterfall from the population baseline to this patient's prediction, and the model's global importance.
  - **Physiology**: every measurement with its value, reference range, high/low flag, signed contribution bar and share of the total explanation. It can be filtered to abnormal or present findings and sorted by impact or by organ system.
  - Selecting a vessel, on the heart or in the panel, switches all explanations to that vessel's model.
- **Honesty cues:**
  - When a dataset patient is loaded, the angiography label and the **out-of-fold** probability are shown next to the live prediction. The live model has seen that patient during training, and the out-of-fold value is the unbiased one.
  - The vessel card states that the dataset gives vessel-level labels only and does not localize lesions within a vessel. For that reason the whole vessel is colored, not a fabricated lesion spot.

## 5. 3D visualization pipeline
**Procedural anatomy** (`frontend/src/anatomy/anatomy.ts`). The ventricular mass is a parametric surface S(u, v):
- u is the azimuth around the long axis: lateral → anterior → right → posterior
- v runs from the base to the apex

The surface has an egg-shaped profile, a right-ventricular bulge, and grooves for the anterior/posterior interventricular and atrioventricular sulci. Atria, the aorta, the pulmonary trunk and branches, and the SVC/IVC are added for context, and an optional translucent torso with rib cage, sternum and spine gives spatial orientation.

**Coronary tree.** Each artery is a list of (u, v) waypoints. They are densified, projected onto the epicardium along the surface normal, and swept into `TubeGeometry`, so the arteries lie in the anatomical grooves:
- **LAD** with 2 diagonals, running down the anterior interventricular groove to the apex
- **LCX** with 2 obtuse marginals, along the left AV groove
- **RCA** with acute marginal, PDA and posterolateral branches, along the right AV groove to the posterior interventricular groove

The left main and RCA start at the aortic root.

**Risk mapping.**
- Every segment of a vessel is colored by its model's probability on a green→amber→red scale. The same scale is used for the dashboard bars, so the 3D view and the numbers always correspond.
- Myocardial vertices are tinted by AHA-style perfusion territories:
  - LAD: anterior wall, septum, apex
  - LCX: lateral wall
  - RCA: inferior wall and RV
- Territory weights are precomputed per vertex, and colors ease smoothly when predictions change.
- High-risk vessels pulse, and the selected vessel gets an additive glow.
- The ventricles beat at the patient's entered pulse rate.

**Interaction.**
- OrbitControls handle rotation and zoom with damping, and there are 5 camera presets (anterior, posterior, left/right lateral, inferior).
- Hovering shows the vessel or territory card.
- Clicking a vessel, its label, or a wall region selects that vessel. Wall clicks resolve the click's surface (u, v) to the dominant territory. Clicking empty space returns to overall CAD.
- Labels are DOM elements projected from 3D every frame, and they fade when their vessel faces away.

**Performance.** The scene uses about 25k triangles and no textures or HDR maps. Device pixel ratio is capped at 1.75. It runs on integrated GPUs and was also verified under software (SwiftShader) rendering.

**Extensibility.** A new vessel or territory is one data entry, with no rendering code changes.

## 6. System architecture and integration
- **Backend:** FastAPI (`src/cad/api.py`).
  - The model registry auto-loads `models/<target>.joblib` and builds a SHAP explainer for each.
  - `POST /api/predict` accepts any subset of features. Missing values are imputed with the training median or mode and returned as `imputed`. BMI and obesity are always derived from weight and height. Unknown feature names, including target names, are rejected with HTTP 422.
  - Other endpoints are `/api/schema` (generates the UI form), `/api/metrics`, `/api/importance` and `/api/patients[/id]`.
  - Inference for all four models plus SHAP takes about 0.1 s.
- **Frontend:** React 19, TypeScript, Vite, @react-three/fiber and drei.
  - Form edits are debounced (120 ms) and in-flight requests are canceled, so the 3D colors, gauge and explanations update in real time while sliders move.
  - The production build is served by FastAPI from the same origin.
- **Reproducibility:**
  - Fixed seeds and pinned `requirements.txt`.
  - Two scripts regenerate every artifact from the raw Excel file.
  - A `pytest` suite covers leakage, encoding validation, SHAP additivity, input handling and a monotonic sanity check.

## 7. Usage
1. Follow the setup steps in `README.md`, then open http://localhost:8000.
2. **Choose a patient.**
   - Pick a dataset patient from the dropdown, or use *Random* or *Median patient*.
   - Or edit any feature: sliders and number fields, Yes/No switches, segmented options. Features are grouped by system, and a filter box finds them by name. Values outside the normal range turn amber.
3. **Read the risk.** The gauge shows the overall CAD probability and status. Vessel bars show LAD/LCX/RCA probabilities, with ground-truth chips for dataset patients.
4. **Explore the heart.** Drag to rotate, scroll to zoom, or use the view presets. Toggle territories, labels, the torso and the heartbeat. Click a vessel or a wall region to inspect it.
5. **Understand why.** Use the *Why this risk?* and *Physiology* tabs for the selected target, and *Model performance* for CV metrics, ROC and calibration curves, the confusion matrix and global importance.

## 8. Limitations and safety
- **Small, single-center data.** n = 303 from one center, with no external validation, so performance may not transfer to other populations.
- **Vessel-level labels only.** The dataset has no lesion location, severity grade or imaging. The 3D mapping is therefore a *visual encoding of vessel-level probabilities*, not anatomical lesion detection, and territories are textbook approximations rather than patient-specific anatomy.
- **Explanations are associations, not causes.** SHAP explains model behavior. Correlated features, such as the chest-pain types, share credit.
- **Not a medical device.** This is for decision-support research and education only.
