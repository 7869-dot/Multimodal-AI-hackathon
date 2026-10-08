"""Model zoo, preprocessing and SHAP explanation for CAD / vessel stenosis.

A fitted model is an sklearn Pipeline("prep" -> "clf"). `Explainer` wraps it
and returns per-original-feature SHAP contributions (one-hot columns are summed
back onto their source feature) so the UI never sees encoded column names.
"""
from __future__ import annotations

from dataclasses import dataclass

import numpy as np
import pandas as pd
import shap
from sklearn.compose import ColumnTransformer
from sklearn.ensemble import RandomForestClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.model_selection import GridSearchCV, StratifiedKFold
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder, StandardScaler
from xgboost import XGBClassifier

from .data import FEATURES, NOMINAL_COLUMNS

SEED = 42

# Constant in this dataset (always N): carries no information. See reports/phase0.
DROPPED_FEATURES = ["Exertional CP"]
MODEL_FEATURES = [f for f in FEATURES if f not in DROPPED_FEATURES]
NUMERIC_FEATURES = [f for f in MODEL_FEATURES if f not in NOMINAL_COLUMNS]


def make_preprocessor(scale: bool) -> ColumnTransformer:
    num = StandardScaler() if scale else "passthrough"
    return ColumnTransformer(
        [
            ("num", num, NUMERIC_FEATURES),
            ("cat", OneHotEncoder(categories=[["N", "LBBB", "RBBB"]], drop="first",
                                  handle_unknown="ignore", sparse_output=False), NOMINAL_COLUMNS),
        ],
        verbose_feature_names_out=False,
    )


def make_model(name: str, pos_weight: float = 1.0) -> Pipeline:
    """Candidate models. Hyper-parameters are deliberately conservative for n=303."""
    if name == "logreg":
        clf = GridSearchCV(
            LogisticRegression(max_iter=5000, class_weight="balanced"),
            {"C": [0.01, 0.03, 0.1, 0.3, 1.0]},
            scoring="roc_auc",
            cv=StratifiedKFold(5, shuffle=True, random_state=SEED),
        )
        return Pipeline([("prep", make_preprocessor(scale=True)), ("clf", clf)])
    if name == "random_forest":
        clf = RandomForestClassifier(
            n_estimators=400, max_depth=6, min_samples_leaf=3, max_features="sqrt",
            class_weight="balanced", random_state=SEED, n_jobs=-1,
        )
        return Pipeline([("prep", make_preprocessor(scale=False)), ("clf", clf)])
    if name == "xgboost":
        clf = XGBClassifier(
            n_estimators=300, max_depth=2, learning_rate=0.05, subsample=0.8,
            colsample_bytree=0.6, min_child_weight=2, reg_lambda=2.0,
            scale_pos_weight=pos_weight, eval_metric="logloss", random_state=SEED, n_jobs=4,
        )
        return Pipeline([("prep", make_preprocessor(scale=False)), ("clf", clf)])
    raise ValueError(name)


CANDIDATES = ["logreg", "random_forest", "xgboost"]


def _estimator(pipe: Pipeline):
    clf = pipe.named_steps["clf"]
    return clf.best_estimator_ if isinstance(clf, GridSearchCV) else clf


def _source_feature(encoded: str) -> str:
    for nom in NOMINAL_COLUMNS:
        if encoded.startswith(nom + "_"):
            return nom
    return encoded


@dataclass
class Explanation:
    base_value: float           # expected model output (in `units`)
    contributions: dict[str, float]  # original feature -> SHAP value
    units: str                  # "log-odds" or "probability"


class Explainer:
    """SHAP explainer over a fitted Pipeline, attributing to original features."""

    def __init__(self, pipe: Pipeline, background: pd.DataFrame):
        self.pipe = pipe
        prep = pipe.named_steps["prep"]
        self.encoded_names = list(prep.get_feature_names_out())
        est = _estimator(pipe)
        bg = prep.transform(background[MODEL_FEATURES])
        if isinstance(est, LogisticRegression):
            self._shap = shap.LinearExplainer(est, bg)
            self.units = "log-odds"
        elif isinstance(est, XGBClassifier):
            self._shap = shap.TreeExplainer(est)
            self.units = "log-odds"
        else:  # random forest: path-dependent TreeSHAP in probability space (fast)
            self._shap = shap.TreeExplainer(est)
            self.units = "probability"

    def _raw(self, Xenc: np.ndarray) -> tuple[np.ndarray, float]:
        sv = self._shap.shap_values(Xenc)
        base = self._shap.expected_value
        if isinstance(sv, list):  # older shap: one array per class
            sv, base = sv[1], base[1]
        sv = np.asarray(sv)
        if sv.ndim == 3:  # (n, features, classes)
            sv = sv[:, :, 1]
            base = np.asarray(base).ravel()[1]
        return sv, float(np.asarray(base).ravel()[0])

    def explain_many(self, X: pd.DataFrame) -> tuple[pd.DataFrame, float]:
        Xenc = self.pipe.named_steps["prep"].transform(X[MODEL_FEATURES])
        sv, base = self._raw(Xenc)
        enc = pd.DataFrame(sv, columns=self.encoded_names, index=X.index)
        grouped = enc.T.groupby(_source_feature, sort=False).sum().T
        return grouped[MODEL_FEATURES], base

    def explain(self, row: pd.DataFrame) -> Explanation:
        df, base = self.explain_many(row)
        return Explanation(base, {k: float(v) for k, v in df.iloc[0].items()}, self.units)
