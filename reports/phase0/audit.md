# Phase 0 dataset audit

- Shape: **303 rows x 59 columns**; missing cells: 0; duplicate rows: 0
- Prevalence: Cath 71.3%, LAD 58.4%, LCX 39.3%, RCA 37.6%

## Label structure

- Cath vs any-vessel-stenotic: {'Cath=0,any=0': 86, 'Cath=0,any=1': 1, 'Cath=1,any=0': 0, 'Cath=1,any=1': 216}
- Inconsistent rows (Cath != any vessel): [93]
- Number of diseased vessels per patient: {0: 86, 1: 87, 2: 67, 3: 63}
- Vessel patterns (LAD,LCX,RCA): {'000': 86, '111': 63, '100': 57, '110': 33, '101': 24, '001': 17, '010': 13, '011': 10}

## Consistency checks

- bmi_recompute_max_abs_diff: 0.0
- bmi_mismatch_gt_1: 0
- obesity_vs_bmi_gt25_disagree: 1
- current_and_ex_smoker: 0
- chest_pain_types_gt1: 0
- chest_pain_types_none: 30
- lymph_plus_neut_gt100: 0

## Outliers (clinical range / 3xIQR)

| feature | min | max | implausible | 3xIQR |
|---|---|---|---|---|
| Age | 30.0 | 86.0 | 0 | 0 |
| Weight | 48.0 | 120.0 | 0 | 0 |
| Length | 140.0 | 188.0 | 0 | 0 |
| BMI | 18.115412710007302 | 40.90065778377467 | 0 | 0 |
| BP | 90.0 | 190.0 | 0 | 0 |
| PR | 50.0 | 110.0 | 0 | 0 |
| FBS | 62.0 | 400.0 | 0 | 9 |
| CR | 0.5 | 2.2 | 0 | 1 |
| TG | 37.0 | 1050.0 | 0 | 5 |
| LDL | 18.0 | 232.0 | 1 | 0 |
| HDL | 15.9 | 111.0 | 0 | 3 |
| BUN | 6.0 | 52.0 | 0 | 3 |
| ESR | 1.0 | 90.0 | 0 | 3 |
| HB | 8.9 | 17.6 | 0 | 0 |
| K | 3.0 | 6.6 | 0 | 1 |
| Na | 128.0 | 156.0 | 0 | 2 |
| WBC | 3700.0 | 18000.0 | 0 | 1 |
| Lymph | 7.0 | 60.0 | 0 | 0 |
| Neut | 32.0 | 89.0 | 0 | 0 |
| PLT | 25.0 | 742.0 | 0 | 1 |
| EF-TTE | 15.0 | 60.0 | 0 | 0 |

## Constant / near-constant features (<10 minority)

- CRF: {'0': 297, '1': 6}
- CVA: {'0': 298, '1': 5}
- Thyroid Disease: {'0': 296, '1': 7}
- CHF: {'0': 302, '1': 1}
- Weak Peripheral Pulse: {'0': 298, '1': 5}
- Diastolic Murmur: {'0': 294, '1': 9}
- Exertional CP: {'0': 303}
- LowTH Ang: {'0': 301, '1': 2}
- Poor R Progression: {'0': 294, '1': 9}

## Strongest univariate associations (top 25 by p)

Effect = phi (binary) or AUC (continuous; 0.5 = none). No feature is near-perfect, so no evident leakage.

| feature | target | test | p | effect |
|---|---|---|---|---|
| Typical Chest Pain | Cath | chi2 | 1.12e-20 | 0.536 |
| Typical Chest Pain | LAD | chi2 | 3.21e-15 | 0.453 |
| Atypical | Cath | chi2 | 1.23e-12 | 0.408 |
| Region RWMA | LAD | mannwhitney | 5.94e-11 | 0.675 |
| EF-TTE | LAD | mannwhitney | 2.00e-10 | 0.292 |
| Age | Cath | mannwhitney | 1.05e-09 | 0.724 |
| Atypical | LAD | chi2 | 1.73e-09 | 0.346 |
| Region RWMA | Cath | mannwhitney | 3.94e-09 | 0.672 |
| Age | LCX | mannwhitney | 1.04e-07 | 0.681 |
| Age | LAD | mannwhitney | 1.45e-07 | 0.677 |
| EF-TTE | Cath | mannwhitney | 1.63e-07 | 0.313 |
| Typical Chest Pain | LCX | chi2 | 6.39e-07 | 0.286 |
| Typical Chest Pain | RCA | chi2 | 7.44e-07 | 0.284 |
| HTN | Cath | chi2 | 1.06e-06 | 0.28 |
| DM | RCA | chi2 | 4.70e-06 | 0.263 |
| Nonanginal | Cath | chi2 | 7.16e-06 | 0.258 |
| BP | Cath | mannwhitney | 8.40e-06 | 0.661 |
| DM | Cath | chi2 | 2.02e-05 | 0.245 |
| FBS | Cath | mannwhitney | 3.78e-05 | 0.651 |
| Tinversion | Cath | chi2 | 6.74e-05 | 0.229 |
| Atypical | RCA | chi2 | 6.81e-05 | 0.229 |
| Neut | RCA | mannwhitney | 8.06e-05 | 0.635 |
| Age | RCA | mannwhitney | 8.34e-05 | 0.635 |
| Lymph | RCA | mannwhitney | 1.80e-04 | 0.372 |
| ESR | Cath | mannwhitney | 2.64e-04 | 0.634 |

## Modeling implications

- n = 303 is small: use repeated stratified k-fold CV (5x10) and report mean +/- sd; no single hold-out.
- Cath is 71% positive: report ROC-AUC/F1 alongside accuracy; tune decision thresholds out-of-fold.
- Drop `Exertional CP` (constant). Keep rare binaries (regularised / tree models tolerate them).
- Extreme lab values are clinically possible (e.g. TG 1050); keep them, models are robust (trees / scaled LR).