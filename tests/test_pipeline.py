"""Run: .venv/Scripts/python -m pytest -q"""
import math
import sys
from pathlib import Path

import pandas as pd
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))
from cad.data import LEAKAGE_COLUMNS, TARGETS, load_dataset, load_raw, normalize  # noqa: E402
from cad.model import MODEL_FEATURES  # noqa: E402

MODELS = Path(__file__).resolve().parents[1] / "models"


def test_no_target_leakage():
    assert not set(LEAKAGE_COLUMNS) & set(MODEL_FEATURES)


def test_dataset_shape_and_targets_binary():
    df = load_dataset()
    assert df.shape[0] == 303
    for t in TARGETS:
        assert set(df[t].unique()) == {0, 1}


def test_normalize_rejects_unknown_codes():
    raw = load_raw()
    raw.loc[0, "DM"] = 1  # numeric col fine
    raw.loc[0, "Obesity"] = "maybe"
    with pytest.raises(ValueError, match="Obesity"):
        normalize(raw)


@pytest.fixture(scope="module")
def client():
    if not all((MODELS / f"{t}.joblib").exists() for t in TARGETS):
        pytest.skip("models not trained - run scripts/train.py")
    from fastapi.testclient import TestClient
    from cad.api import app
    return TestClient(app)


def test_predict_and_shap_additivity(client):
    patient = client.get("/api/patients/5").json()
    r = client.post("/api/predict", json={"features": patient["features"]})
    assert r.status_code == 200
    body = r.json()
    assert set(body["predictions"]) == set(TARGETS)
    for t, p in body["predictions"].items():
        assert 0 <= p["probability"] <= 1
        e = p["explanation"]
        total = e["base_value"] + sum(c["contribution"] for c in e["contributions"])
        prob = 1 / (1 + math.exp(-total)) if e["units"] == "log-odds" else total
        assert prob == pytest.approx(p["probability"], abs=2e-3), t
        assert {c["feature"] for c in e["contributions"]} == set(MODEL_FEATURES)


def test_partial_input_is_imputed_and_bmi_derived(client):
    r = client.post("/api/predict", json={"features": {"Weight": 100, "Length": 200}}).json()
    assert r["derived"]["BMI"] == pytest.approx(25.0)
    assert "Age" in r["imputed"]


def test_unknown_feature_rejected(client):
    assert client.post("/api/predict", json={"features": {"LAD": 1}}).status_code == 422


def test_monotone_sanity_typical_chest_pain_raises_cad(client):
    base = client.get("/api/patients/5").json()["features"]
    lo = client.post("/api/predict", json={"features": {**base, "Typical Chest Pain": 0}}).json()
    hi = client.post("/api/predict", json={"features": {**base, "Typical Chest Pain": 1}}).json()
    assert hi["predictions"]["Cath"]["probability"] > lo["predictions"]["Cath"]["probability"]
