"""Phase 1+2: evaluate candidate models with repeated stratified CV, select one
per target, refit on all data, and export everything the API/UI needs.

Run: .venv/Scripts/python scripts/train.py [--repeats 10]
Outputs: models/<target>.joblib, artifacts/*.json, reports/phase1/*.md
"""
from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
from sklearn.calibration import calibration_curve
from sklearn.metrics import (accuracy_score, brier_score_loss, confusion_matrix, f1_score,
                             precision_score, recall_score, roc_auc_score, roc_curve)
from sklearn.model_selection import RepeatedStratifiedKFold

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))
from cad import __version__  # noqa: E402
from cad.data import FEATURE_GROUPS, TARGETS, load_dataset  # noqa: E402
from cad.features_meta import GROUP_LABELS, META, TARGET_META  # noqa: E402
from cad.model import CANDIDATES, DROPPED_FEATURES, MODEL_FEATURES, SEED, Explainer, make_model  # noqa: E402

ROOT = Path(__file__).resolve().parents[1]
MODELS = ROOT / "models"
ART = ROOT / "artifacts"
REPORT = ROOT / "reports" / "phase1"
THRESHOLD = 0.5
METRICS = ["accuracy", "precision", "recall", "f1", "roc_auc", "brier"]


def score(y, p, thr=THRESHOLD) -> dict:
    yhat = (p >= thr).astype(int)
    return {
        "accuracy": accuracy_score(y, yhat),
        "precision": precision_score(y, yhat, zero_division=0),
        "recall": recall_score(y, yhat),
        "f1": f1_score(y, yhat),
        "roc_auc": roc_auc_score(y, p),
        "brier": brier_score_loss(y, p),
    }


def summarise(rows: list[dict]) -> dict:
    df = pd.DataFrame(rows)
    return {m: {"mean": round(float(df[m].mean()), 4), "std": round(float(df[m].std()), 4),
                "ci95": [round(float(df[m].quantile(0.025)), 4), round(float(df[m].quantile(0.975)), 4)]}
            for m in METRICS}


def evaluate(df: pd.DataFrame, target: str, repeats: int) -> tuple[dict, dict[str, np.ndarray]]:
    X, y = df[MODEL_FEATURES], df[target].to_numpy()
    pos_weight = float((y == 0).sum() / (y == 1).sum())
    cv = RepeatedStratifiedKFold(n_splits=5, n_repeats=repeats, random_state=SEED)
    fold_scores = {m: [] for m in [*CANDIDATES, "baseline_prior"]}
    oof = {m: np.zeros((repeats, len(y))) for m in CANDIDATES}
    for i, (tr, te) in enumerate(cv.split(X, y)):
        rep = i // 5
        for name in CANDIDATES:
            pipe = make_model(name, pos_weight).fit(X.iloc[tr], y[tr])
            p = pipe.predict_proba(X.iloc[te])[:, 1]
            oof[name][rep, te] = p
            fold_scores[name].append(score(y[te], p))
        prior = np.full(len(te), y[tr].mean())
        fold_scores["baseline_prior"].append(score(y[te], prior))
    summary = {m: summarise(s) for m, s in fold_scores.items()}
    return summary, {m: v.mean(axis=0) for m, v in oof.items()}


def curves(y: np.ndarray, p: np.ndarray) -> dict:
    fpr, tpr, thr = roc_curve(y, p)
    idx = np.unique(np.linspace(0, len(fpr) - 1, min(len(fpr), 60)).astype(int))
    frac_pos, mean_pred = calibration_curve(y, p, n_bins=8, strategy="quantile")
    tn, fp, fn, tp = confusion_matrix(y, (p >= THRESHOLD).astype(int)).ravel()
    return {
        "roc": {"fpr": fpr[idx].round(4).tolist(), "tpr": tpr[idx].round(4).tolist()},
        "calibration": {"mean_predicted": mean_pred.round(4).tolist(), "fraction_positive": frac_pos.round(4).tolist()},
        "confusion": {"tn": int(tn), "fp": int(fp), "fn": int(fn), "tp": int(tp)},
        "oof_auc": round(float(roc_auc_score(y, p)), 4),
    }


def schema(df: pd.DataFrame) -> dict:
    feats = []
    for group, cols in FEATURE_GROUPS.items():
        for c in cols:
            if c in DROPPED_FEATURES:
                continue
            m = dict(META[c])
            s = df[c]
            m.update(name=c, group=group)
            if m["kind"] == "number":
                m.update(min=float(s.min()), max=float(s.max()), default=float(round(s.median(), 2)))
            elif m["kind"] == "category":
                m["default"] = str(s.mode()[0])
            else:
                m["default"] = int(s.mode()[0])
            feats.append(m)
    return {"version": __version__, "groups": GROUP_LABELS, "features": feats,
            "targets": {t: TARGET_META[t] for t in TARGETS}, "threshold": THRESHOLD,
            "dropped_features": DROPPED_FEATURES}


def jsonable_row(row: pd.Series) -> dict:
    return {k: (str(v) if k == "BBB" else (float(v) if isinstance(v, (float, np.floating)) else int(v)))
            for k, v in row.items()}


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--repeats", type=int, default=10)
    args = ap.parse_args()
    for d in (MODELS, ART, REPORT):
        d.mkdir(parents=True, exist_ok=True)

    df = load_dataset()
    X = df[MODEL_FEATURES]
    metrics, selected, all_curves, oof_selected, importance = {}, {}, {}, {}, {}
    t0 = time.time()
    for target in TARGETS:
        y = df[target].to_numpy()
        summary, oof = evaluate(df, target, args.repeats)
        best = max(CANDIDATES, key=lambda m: summary[m]["roc_auc"]["mean"])
        metrics[target] = summary
        selected[target] = best
        oof_selected[target] = oof[best]
        all_curves[target] = {m: curves(y, oof[m]) for m in CANDIDATES}
        print(f"[{time.time() - t0:6.1f}s] {target}: " + ", ".join(
            f"{m}={summary[m]['roc_auc']['mean']:.3f}" for m in summary) + f" -> {best}")

        pos_weight = float((y == 0).sum() / (y == 1).sum())
        final = make_model(best, pos_weight).fit(X, y)
        joblib.dump({"pipeline": final, "model_name": best, "target": target,
                     "features": MODEL_FEATURES, "version": __version__}, MODELS / f"{target}.joblib")
        sv, _ = Explainer(final, df).explain_many(df)
        imp = sv.abs().mean().sort_values(ascending=False)
        importance[target] = {k: round(float(v), 5) for k, v in imp.items()}

    (ART / "metrics.json").write_text(json.dumps({
        "cv": "RepeatedStratifiedKFold(n_splits=5, n_repeats=%d), seed=%d" % (args.repeats, SEED),
        "threshold": THRESHOLD, "selected": selected, "metrics": metrics, "curves": all_curves,
        "n": len(df), "prevalence": {t: round(float(df[t].mean()), 4) for t in TARGETS},
    }, indent=1), encoding="utf-8")
    (ART / "global_importance.json").write_text(json.dumps(importance, indent=1), encoding="utf-8")
    (ART / "schema.json").write_text(json.dumps(schema(df), indent=1, ensure_ascii=False), encoding="utf-8")
    patients = []
    for i, row in df.iterrows():
        patients.append({
            "id": int(i), "features": jsonable_row(row[MODEL_FEATURES]),
            "labels": {t: int(row[t]) for t in TARGETS},
            "oof_probability": {t: round(float(oof_selected[t][i]), 4) for t in TARGETS},
        })
    (ART / "patients.json").write_text(json.dumps(patients), encoding="utf-8")

    # Markdown report
    md = ["# Phase 1 model evaluation", "",
          f"CV: 5-fold stratified x {args.repeats} repeats (n={len(df)}). Threshold {THRESHOLD}. "
          "Values are mean ± sd over folds. Selected model (by mean ROC-AUC) in bold.", ""]
    for t in TARGETS:
        md += [f"## {t} — {TARGET_META[t]['label']} (prevalence {df[t].mean():.1%})", "",
               "| model | " + " | ".join(METRICS) + " |", "|---" * (len(METRICS) + 1) + "|"]
        for m, s in metrics[t].items():
            name = f"**{m}**" if m == selected[t] else m
            md.append(f"| {name} | " + " | ".join(f"{s[k]['mean']:.3f} ± {s[k]['std']:.3f}" for k in METRICS) + " |")
        top = list(importance[t])[:8]
        md += ["", "Top features (mean |SHAP|): " + ", ".join(top), ""]
    (REPORT / "evaluation.md").write_text("\n".join(md), encoding="utf-8")
    print("\n".join(md))


if __name__ == "__main__":
    main()
