"""FastAPI backend: serves predictions + SHAP explanations, model metrics,
the feature schema, demo patients and the built frontend.

Run: .venv/Scripts/python -m uvicorn cad.api:app --app-dir src --port 8000
"""
from __future__ import annotations

import json
import os
import threading
from contextlib import asynccontextmanager
from functools import lru_cache
from pathlib import Path

import joblib
import pandas as pd
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from . import __version__
from .data import TARGETS, load_dataset
from .features_meta import META
# NOTE: `.model` pulls in shap/xgboost/sklearn, which are slow to import on constrained
# hosts (e.g. Render free tier). uvicorn must finish importing this module before it
# binds the port, so importing those eagerly here can blow past the platform's port-scan
# timeout. Deferred into Registry.__init__ instead, which only runs on the first request.

ROOT = Path(__file__).resolve().parents[2]
MODELS_DIR = ROOT / "models"
ART = ROOT / "artifacts"
FRONTEND_DIST = ROOT / "frontend" / "dist"

DISCLAIMER = ("For decision support and educational purposes only. Not a substitute for "
              "coronary angiography or other formal diagnostic imaging.")


def _read(name: str):
    return json.loads((ART / name).read_text(encoding="utf-8"))


class Registry:
    """Loads every models/<target>.joblib. Adding a target = dropping in a file
    (plus its TARGET_META entry for labels)."""

    def __init__(self) -> None:
        from .model import MODEL_FEATURES, Explainer  # see note at top of file

        self.MODEL_FEATURES = MODEL_FEATURES
        background = load_dataset()
        self.schema = _read("schema.json")
        self.defaults = {f["name"]: f["default"] for f in self.schema["features"]}
        self.feature_group = {f["name"]: f["group"] for f in self.schema["features"]}
        self.models: dict[str, dict] = {}
        for t in TARGETS:
            path = MODELS_DIR / f"{t}.joblib"
            if not path.exists():
                continue
            bundle = joblib.load(path)
            clf = bundle["pipeline"].named_steps["clf"]
            if hasattr(clf, "n_jobs"):  # single-row inference: thread pools only add latency
                clf.set_params(n_jobs=1)
            bundle["explainer"] = Explainer(bundle["pipeline"], background)
            self.models[t] = bundle
        if not self.models:
            raise RuntimeError("No models found - run scripts/train.py first.")

    def frame(self, features: dict) -> tuple[pd.DataFrame, list[str]]:
        MODEL_FEATURES = self.MODEL_FEATURES
        unknown = set(features) - set(MODEL_FEATURES)
        if unknown:
            raise HTTPException(422, f"Unknown features: {sorted(unknown)}")
        imputed = [f for f in MODEL_FEATURES if f not in features or features[f] is None]
        row = {**self.defaults, **{k: v for k, v in features.items() if v is not None}}
        # Keep derived fields consistent with their sources.
        if row.get("Weight") and row.get("Length"):
            row["BMI"] = round(float(row["Weight"]) / (float(row["Length"]) / 100) ** 2, 2)
            row["Obesity"] = int(row["BMI"] > 25)
        df = pd.DataFrame([row])[MODEL_FEATURES]
        df["BBB"] = pd.Categorical(df["BBB"].astype(str), categories=["LBBB", "N", "RBBB"])
        for c in MODEL_FEATURES:
            if c != "BBB":
                df[c] = pd.to_numeric(df[c])
        return df, imputed

    def predict(self, features: dict) -> dict:
        df, imputed = self.frame(features)
        threshold = self.schema["threshold"]
        out = {}
        for t, b in self.models.items():
            p = float(b["pipeline"].predict_proba(df)[0, 1])
            ex = b["explainer"].explain(df)
            contribs = []
            for f, v in ex.contributions.items():
                m = META[f]
                val = df.iloc[0][f]
                status = None
                if "normal" in m and m["kind"] == "number":
                    lo, hi = m["normal"]
                    status = "low" if val < lo else "high" if val > hi else "normal"
                contribs.append({
                    "feature": f, "label": m["label"], "group": self.feature_group[f],
                    "value": str(val) if f == "BBB" else float(val), "unit": m.get("unit"),
                    "status": status, "contribution": round(v, 5),
                })
            contribs.sort(key=lambda c: -abs(c["contribution"]))
            out[t] = {
                "probability": round(p, 4), "positive": p >= threshold, "model": b["model_name"],
                "explanation": {"base_value": round(ex.base_value, 5), "units": ex.units,
                                "contributions": contribs},
            }
        return {"predictions": out, "imputed": imputed, "derived": {"BMI": float(df.iloc[0]["BMI"]),
                "Obesity": int(df.iloc[0]["Obesity"])}, "threshold": threshold, "disclaimer": DISCLAIMER}


@lru_cache(maxsize=1)
def registry() -> Registry:
    return Registry()


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Fire-and-forget: loading models/building SHAP explainers can take a while on a
    # slow/cold host. Doing it in a background thread lets uvicorn report the port as
    # open immediately, instead of blocking startup on it.
    threading.Thread(target=registry, daemon=True).start()
    yield


app = FastAPI(title="CardioVision CAD API", version=__version__, lifespan=lifespan)
# Comma-separated list, e.g. "https://cardiovision.vercel.app". Defaults to any origin.
CORS_ORIGINS = [o.strip() for o in os.environ.get("CORS_ORIGINS", "*").split(",") if o.strip()]
app.add_middleware(CORSMiddleware, allow_origins=CORS_ORIGINS, allow_methods=["*"], allow_headers=["*"])


class PredictRequest(BaseModel):
    features: dict[str, float | int | str | None] = Field(default_factory=dict)


@app.get("/api/health")
def health():
    try:
        r = registry()
    except RuntimeError:
        return {"status": "starting", "version": __version__}
    return {"status": "ok", "version": __version__, "models": {t: b["model_name"] for t, b in r.models.items()}}


@app.get("/api/schema")
def schema():
    return registry().schema


@app.get("/api/metrics")
def metrics():
    return _read("metrics.json")


@app.get("/api/importance")
def importance():
    return _read("global_importance.json")


@lru_cache(maxsize=1)
def _patients() -> list[dict]:
    return _read("patients.json")


@app.get("/api/patients")
def patients():
    return [{"id": p["id"], "age": p["features"]["Age"], "sex": p["features"]["Sex"],
             "labels": p["labels"], "oof_probability": p["oof_probability"]} for p in _patients()]


@app.get("/api/patients/{pid}")
def patient(pid: int):
    for p in _patients():
        if p["id"] == pid:
            return p
    raise HTTPException(404, "patient not found")


@app.post("/api/predict")
def predict(req: PredictRequest):
    return registry().predict(req.features)


if FRONTEND_DIST.exists():
    app.mount("/", StaticFiles(directory=FRONTEND_DIST, html=True), name="frontend")
