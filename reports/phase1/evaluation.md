# Phase 1 model evaluation

CV: 5-fold stratified x 10 repeats (n=303). Threshold 0.5. Values are mean ± sd over folds. Selected model (by mean ROC-AUC) in bold.

## Cath — Overall CAD (prevalence 71.3%)

| model | accuracy | precision | recall | f1 | roc_auc | brier |
|---|---|---|---|---|---|---|
| **logreg** | 0.864 ± 0.042 | 0.944 ± 0.033 | 0.861 ± 0.054 | 0.899 ± 0.033 | 0.930 ± 0.033 | 0.124 ± 0.019 |
| random_forest | 0.863 ± 0.044 | 0.915 ± 0.033 | 0.892 ± 0.050 | 0.902 ± 0.032 | 0.926 ± 0.036 | 0.120 ± 0.016 |
| xgboost | 0.865 ± 0.042 | 0.919 ± 0.037 | 0.890 ± 0.044 | 0.904 ± 0.031 | 0.916 ± 0.038 | 0.104 ± 0.026 |
| baseline_prior | 0.713 ± 0.007 | 0.713 ± 0.007 | 1.000 ± 0.000 | 0.832 ± 0.005 | 0.500 ± 0.000 | 0.205 ± 0.003 |

Top features (mean |SHAP|): Typical Chest Pain, Age, Atypical, Tinversion, HTN, Region RWMA, DM, Dyspnea

## LAD — Left Anterior Descending (prevalence 58.4%)

| model | accuracy | precision | recall | f1 | roc_auc | brier |
|---|---|---|---|---|---|---|
| logreg | 0.750 ± 0.037 | 0.802 ± 0.047 | 0.764 ± 0.065 | 0.780 ± 0.036 | 0.842 ± 0.041 | 0.172 ± 0.013 |
| **random_forest** | 0.787 ± 0.044 | 0.808 ± 0.049 | 0.839 ± 0.056 | 0.821 ± 0.036 | 0.853 ± 0.038 | 0.169 ± 0.011 |
| xgboost | 0.763 ± 0.047 | 0.802 ± 0.053 | 0.794 ± 0.072 | 0.795 ± 0.043 | 0.825 ± 0.045 | 0.170 ± 0.025 |
| baseline_prior | 0.584 ± 0.006 | 0.584 ± 0.006 | 1.000 ± 0.000 | 0.738 ± 0.005 | 0.500 ± 0.000 | 0.243 ± 0.001 |

Top features (mean |SHAP|): Typical Chest Pain, Region RWMA, EF-TTE, Age, Atypical, ESR, Neut, Lymph

## LCX — Left Circumflex (prevalence 39.3%)

| model | accuracy | precision | recall | f1 | roc_auc | brier |
|---|---|---|---|---|---|---|
| logreg | 0.637 ± 0.061 | 0.531 ± 0.070 | 0.616 ± 0.117 | 0.568 ± 0.084 | 0.694 ± 0.067 | 0.222 ± 0.016 |
| random_forest | 0.682 ± 0.054 | 0.591 ± 0.067 | 0.633 ± 0.098 | 0.609 ± 0.070 | 0.734 ± 0.062 | 0.211 ± 0.013 |
| **xgboost** | 0.701 ± 0.056 | 0.623 ± 0.083 | 0.626 ± 0.101 | 0.620 ± 0.076 | 0.743 ± 0.061 | 0.205 ± 0.028 |
| baseline_prior | 0.607 ± 0.005 | 0.000 ± 0.000 | 0.000 ± 0.000 | 0.000 ± 0.000 | 0.500 ± 0.000 | 0.238 ± 0.001 |

Top features (mean |SHAP|): Age, Typical Chest Pain, TG, CR, HDL, PLT, FBS, ESR

## RCA — Right Coronary Artery (prevalence 37.6%)

| model | accuracy | precision | recall | f1 | roc_auc | brier |
|---|---|---|---|---|---|---|
| **logreg** | 0.660 ± 0.052 | 0.543 ± 0.061 | 0.658 ± 0.114 | 0.590 ± 0.066 | 0.731 ± 0.055 | 0.210 ± 0.013 |
| random_forest | 0.660 ± 0.057 | 0.549 ± 0.080 | 0.562 ± 0.113 | 0.551 ± 0.083 | 0.720 ± 0.055 | 0.211 ± 0.010 |
| xgboost | 0.650 ± 0.052 | 0.542 ± 0.081 | 0.545 ± 0.112 | 0.536 ± 0.071 | 0.705 ± 0.058 | 0.221 ± 0.025 |
| baseline_prior | 0.624 ± 0.005 | 0.000 ± 0.000 | 0.000 ± 0.000 | 0.000 ± 0.000 | 0.500 ± 0.000 | 0.235 ± 0.001 |

Top features (mean |SHAP|): DM, Typical Chest Pain, Age, Atypical, Sex, ESR, Dyspnea, Neut
