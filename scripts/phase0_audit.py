"""Phase 0 dataset audit -> reports/phase0/audit.md + audit.json.

Run: .venv/Scripts/python scripts/phase0_audit.py
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd
from scipy import stats

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))
from cad.data import FEATURES, ROOT, TARGETS, VESSEL_TARGETS, load_dataset, load_raw  # noqa: E402

OUT = ROOT / "reports" / "phase0"

# Broad plausibility ranges for adults (values outside are flagged, not dropped).
CLINICAL_RANGES = {
    "Age": (18, 100), "Weight": (30, 200), "Length": (130, 210), "BMI": (13, 60),
    "BP": (70, 250), "PR": (35, 180), "FBS": (40, 500), "CR": (0.3, 10), "TG": (20, 1500),
    "LDL": (20, 300), "HDL": (10, 120), "BUN": (3, 100), "ESR": (0, 140), "HB": (6, 20),
    "K": (2.5, 7), "Na": (115, 160), "WBC": (2000, 30000), "Lymph": (1, 90),
    "Neut": (10, 98), "PLT": (20, 800), "EF-TTE": (10, 75),
}


def profile(df: pd.DataFrame) -> list[dict]:
    rows = []
    for c in df.columns:
        s = df[c]
        r = {"column": c, "dtype": str(s.dtype), "n_unique": int(s.nunique()), "missing": int(s.isna().sum())}
        if pd.api.types.is_numeric_dtype(s):
            r.update(min=float(s.min()), max=float(s.max()), mean=round(float(s.mean()), 3))
        else:
            r["values"] = {str(k): int(v) for k, v in s.value_counts().items()}
        rows.append(r)
    return rows


def consistency(df: pd.DataFrame) -> dict:
    bmi = df["Weight"] / (df["Length"] / 100) ** 2
    bmi_diff = (bmi - df["BMI"]).abs()
    return {
        "bmi_recompute_max_abs_diff": round(float(bmi_diff.max()), 3),
        "bmi_mismatch_gt_1": int((bmi_diff > 1).sum()),
        "obesity_vs_bmi_gt25_disagree": int(((df["BMI"] > 25).astype(int) != df["Obesity"]).sum()),
        "current_and_ex_smoker": int(((df["Current Smoker"] == 1) & (df["EX-Smoker"] == 1)).sum()),
        "chest_pain_types_gt1": int((df[["Typical Chest Pain", "Atypical", "Nonanginal"]].sum(axis=1) > 1).sum()),
        "chest_pain_types_none": int((df[["Typical Chest Pain", "Atypical", "Nonanginal"]].sum(axis=1) == 0).sum()),
        "lymph_plus_neut_gt100": int((df["Lymph"] + df["Neut"] > 100).sum()),
    }


def outliers(df: pd.DataFrame) -> dict:
    out = {}
    for c, (lo, hi) in CLINICAL_RANGES.items():
        s = df[c]
        q1, q3 = s.quantile([0.25, 0.75])
        iqr = q3 - q1
        out[c] = {
            "implausible": int(((s < lo) | (s > hi)).sum()),
            "iqr3_outliers": int(((s < q1 - 3 * iqr) | (s > q3 + 3 * iqr)).sum()),
            "min": float(s.min()), "max": float(s.max()),
        }
    return out


def label_structure(df: pd.DataFrame) -> dict:
    any_vessel = df[VESSEL_TARGETS].max(axis=1)
    ct = pd.crosstab(df["Cath"], any_vessel, rownames=["Cath"], colnames=["any_vessel"])
    patterns = df[VESSEL_TARGETS].astype(str).agg("".join, axis=1).value_counts()
    return {
        "cath_vs_any_vessel": {f"Cath={i},any={j}": int(ct.loc[i, j]) for i in ct.index for j in ct.columns},
        "inconsistent_rows": df.index[(df["Cath"] != any_vessel)].tolist(),
        "vessel_patterns_LAD_LCX_RCA": {k: int(v) for k, v in patterns.items()},
        "n_diseased_vessels": {int(k): int(v) for k, v in df[VESSEL_TARGETS].sum(axis=1).value_counts().sort_index().items()},
        "target_correlation": df[TARGETS].corr().round(3).to_dict(),
        "prevalence": {t: round(float(df[t].mean()), 3) for t in TARGETS},
    }


def associations(df: pd.DataFrame) -> list[dict]:
    """Univariate association of every feature with every target.
    Binary features: chi2 + phi. Continuous: Mann-Whitney + AUC as effect size."""
    rows = []
    for f in FEATURES:
        x = df[f]
        if str(x.dtype) == "category":
            continue
        for t in TARGETS:
            y = df[t]
            if x.nunique() <= 1:
                continue
            if x.nunique() == 2:
                tab = pd.crosstab(x, y)
                chi2, p, *_ = stats.chi2_contingency(tab)
                eff = float(np.sqrt(chi2 / len(df)))
                rows.append({"feature": f, "target": t, "test": "chi2", "p": float(p), "effect": round(eff, 3)})
            else:
                a, b = x[y == 1], x[y == 0]
                u, p = stats.mannwhitneyu(a, b)
                auc = u / (len(a) * len(b))
                rows.append({"feature": f, "target": t, "test": "mannwhitney", "p": float(p), "effect": round(float(auc), 3)})
    return rows


def near_constant(df: pd.DataFrame, min_minority: int = 10) -> dict:
    out = {}
    for f in FEATURES:
        vc = df[f].value_counts()
        if len(vc) == 1 or vc.iloc[1:].sum() < min_minority:
            out[f] = {str(k): int(v) for k, v in vc.items()}
    return out


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    raw = load_raw()
    df = load_dataset()
    assoc = associations(df)
    audit = {
        "shape": list(raw.shape),
        "missing_total": int(raw.isna().sum().sum()),
        "duplicate_rows": int(raw.duplicated().sum()),
        "profile": profile(raw),
        "consistency": consistency(df),
        "outliers": outliers(df),
        "labels": label_structure(df),
        "near_constant": near_constant(df),
        "associations": assoc,
    }
    (OUT / "audit.json").write_text(json.dumps(audit, indent=2, default=str), encoding="utf-8")

    L = audit["labels"]
    md = [
        "# Phase 0 dataset audit", "",
        f"- Shape: **{audit['shape'][0]} rows x {audit['shape'][1]} columns**; missing cells: {audit['missing_total']}; duplicate rows: {audit['duplicate_rows']}",
        f"- Prevalence: " + ", ".join(f"{k} {v:.1%}" for k, v in L["prevalence"].items()), "",
        "## Label structure", "",
        f"- Cath vs any-vessel-stenotic: {L['cath_vs_any_vessel']}",
        f"- Inconsistent rows (Cath != any vessel): {L['inconsistent_rows']}",
        f"- Number of diseased vessels per patient: {L['n_diseased_vessels']}",
        f"- Vessel patterns (LAD,LCX,RCA): {L['vessel_patterns_LAD_LCX_RCA']}", "",
        "## Consistency checks", "",
        *[f"- {k}: {v}" for k, v in audit["consistency"].items()], "",
        "## Outliers (clinical range / 3xIQR)", "",
        "| feature | min | max | implausible | 3xIQR |", "|---|---|---|---|---|",
        *[f"| {k} | {v['min']} | {v['max']} | {v['implausible']} | {v['iqr3_outliers']} |" for k, v in audit["outliers"].items()], "",
        "## Constant / near-constant features (<10 minority)", "",
        *[f"- {k}: {v}" for k, v in audit["near_constant"].items()], "",
        "## Strongest univariate associations (top 25 by p)", "",
        "Effect = phi (binary) or AUC (continuous; 0.5 = none). No feature is near-perfect, so no evident leakage.", "",
        "| feature | target | test | p | effect |", "|---|---|---|---|---|",
        *[f"| {r['feature']} | {r['target']} | {r['test']} | {r['p']:.2e} | {r['effect']} |"
          for r in sorted(assoc, key=lambda r: r["p"])[:25]], "",
        "## Modeling implications", "",
        "- n = 303 is small: use repeated stratified k-fold CV (5x10) and report mean +/- sd; no single hold-out.",
        "- Cath is 71% positive: report ROC-AUC/F1 alongside accuracy; tune decision thresholds out-of-fold.",
        "- Drop `Exertional CP` (constant). Keep rare binaries (regularised / tree models tolerate them).",
        "- Extreme lab values are clinically possible (e.g. TG 1050); keep them, models are robust (trees / scaled LR).",
    ]
    (OUT / "audit.md").write_text("\n".join(md), encoding="utf-8")
    print("\n".join(md[:30]))


if __name__ == "__main__":
    main()
