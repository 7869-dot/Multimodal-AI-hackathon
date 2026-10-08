# Demo video script (target length about 6 minutes; the brief allows 3–10)

Record at 1600×900 or larger. Start the app with `uvicorn cad.api:app --app-dir src --port 8000` and open http://localhost:8000.

| Time | Show | Say |
|---|---|---|
| 0:00 | Title card, then the app at load | The problem: risk numbers alone don't show *where* disease is. CardioVision predicts overall CAD plus LAD/LCX/RCA stenosis from routine clinical data, and maps them onto a 3D heart. Point to the disclaimer banner. |
| 0:40 | Hover the LAD, LCX and RCA in the anterior view | Vessel colors use the same scale as the dashboard bars. Myocardium is tinted by perfusion territory. The heart beats at the patient's pulse rate. |
| 1:20 | Rotate, zoom, presets (Posterior → Inferior shows the PDA), toggle Torso context | Interactive anatomy: the coronary tree is projected into the real grooves. The torso gives orientation. |
| 2:00 | Click the RCA, then a lateral wall region (selects LCX), then empty space (back to CAD) | Selection drives the whole dashboard. Clicking the wall resolves to the supplying artery. |
| 2:30 | *Why this risk?* tab: summary and waterfall | SHAP: the baseline, then each factor pushing risk up (red) or down (blue), reaching this patient's probability. Explanations are exact and additive. |
| 3:15 | **Live what-if:** turn Typical chest pain on, raise Age, set Region RWMA = 3, lower EF | Watch the vessels and territories shift color in real time, about 0.1 s per round trip. LAD jumps with RWMA and low EF, which is clinically sensible. |
| 4:00 | *Physiology* tab, "abnormal only", sort by system | Each measurement with its normal range, high/low flag and contribution to the selected vessel's prediction. |
| 4:30 | Load a dataset patient with labels | Angiography labels and honest out-of-fold estimates are shown next to the live prediction. |
| 5:00 | *Model performance* tab: switch targets | 5×10 repeated stratified CV, 3 candidate models, baseline comparison, ROC and calibration curves, confusion matrix. CAD AUC 0.93, LAD 0.85, LCX/RCA about 0.74. No leakage: vessel and Cath labels are never inputs. |
| 5:40 | Code tour: `data.py` → `train.py` → `api.py` → `anatomy.ts` | Single schema source, registry-based API, data-driven anatomy: adding a feature, model or vessel needs no redesign. Run `pytest` (7 passed). |
| 6:20 | Closing | Limitations (vessel-level labels, n = 303) and the decision-support disclaimer. |
