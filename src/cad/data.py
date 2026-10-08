"""Dataset schema and loading for the extension of the Z-Alizadeh Sani dataset.

Every later phase (training, SHAP, API) imports from here so the feature list,
target definitions and leakage exclusions live in exactly one place.
"""
from __future__ import annotations

from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parents[2]
RAW_XLSX = ROOT / "extention of Z-Alizadeh sani dataset.xlsx"
RAW_SHEET = "Sheet 1 - Table 1"  # "Sheet1" is an empty 100-column template

# --- Targets -----------------------------------------------------------------
VESSEL_TARGETS = ["LAD", "LCX", "RCA"]
CAD_TARGET = "Cath"
TARGETS = [CAD_TARGET, *VESSEL_TARGETS]
# Brief req 1d: none of these may be a model input for any target.
LEAKAGE_COLUMNS = list(TARGETS)

# --- Feature groups (brief req 1c) -------------------------------------------
FEATURE_GROUPS: dict[str, list[str]] = {
    "demographic": ["Age", "Weight", "Length", "Sex", "BMI"],
    "history": [
        "DM", "HTN", "Current Smoker", "EX-Smoker", "FH", "Obesity", "CRF", "CVA",
        "Airway disease", "Thyroid Disease", "CHF", "DLP",
    ],
    "exam": [
        "BP", "PR", "Edema", "Weak Peripheral Pulse", "Lung rales",
        "Systolic Murmur", "Diastolic Murmur",
    ],
    "symptoms": [
        "Typical Chest Pain", "Dyspnea", "Function Class", "Atypical",
        "Nonanginal", "Exertional CP", "LowTH Ang",
    ],
    "ecg": [
        "Q Wave", "St Elevation", "St Depression", "Tinversion", "LVH",
        "Poor R Progression", "BBB",
    ],
    "lab": [
        "FBS", "CR", "TG", "LDL", "HDL", "BUN", "ESR", "HB", "K", "Na", "WBC",
        "Lymph", "Neut", "PLT",
    ],
    "echo": ["EF-TTE", "Region RWMA", "VHD"],
}
FEATURES = [c for cols in FEATURE_GROUPS.values() for c in cols]

# Y/N text flags and 0/1 int flags are both normalised to 0/1 ints.
YN_COLUMNS = [
    "Obesity", "CRF", "CVA", "Airway disease", "Thyroid Disease", "CHF", "DLP",
    "Weak Peripheral Pulse", "Lung rales", "Systolic Murmur", "Diastolic Murmur",
    "Dyspnea", "Atypical", "Nonanginal", "Exertional CP", "LowTH Ang", "LVH",
    "Poor R Progression",
]
ORDINAL_MAPS: dict[str, dict[str, int]] = {
    "VHD": {"N": 0, "mild": 1, "Moderate": 2, "Severe": 3},
}
# Nominal (unordered) categoricals, one-hot encoded at model time.
NOMINAL_COLUMNS = ["BBB"]
SEX_MAP = {"Male": 1, "Fmale": 0, "Female": 0}  # source file spells it "Fmale"
TARGET_MAPS = {
    **{v: {"Stenotic": 1, "Normal": 0} for v in VESSEL_TARGETS},
    CAD_TARGET: {"CAD": 1, "Normal": 0},
}


def load_raw(path: Path = RAW_XLSX) -> pd.DataFrame:
    """Load the sheet exactly as stored, only stripping header/cell whitespace."""
    df = pd.read_excel(path, sheet_name=RAW_SHEET)
    df.columns = [str(c).strip() for c in df.columns]
    for c in df.select_dtypes(include=["object", "string"]).columns:
        df[c] = df[c].str.strip()
    return df


def normalize(raw: pd.DataFrame) -> pd.DataFrame:
    """Map text codes to numbers. Raises on any value not in the known code sets,
    so an unexpected category can never silently become NaN."""
    df = raw.copy()

    def _map(col: str, mapping: dict) -> None:
        unknown = set(df[col].dropna().unique()) - set(mapping)
        if unknown:
            raise ValueError(f"{col}: unknown values {sorted(map(str, unknown))}")
        df[col] = df[col].map(mapping).astype("int64")

    _map("Sex", SEX_MAP)
    for c in YN_COLUMNS:
        _map(c, {"Y": 1, "N": 0})
    for c, m in ORDINAL_MAPS.items():
        _map(c, m)
    for c, m in TARGET_MAPS.items():
        _map(c, m)
    df["BBB"] = df["BBB"].astype("category")
    return df


def load_dataset() -> pd.DataFrame:
    return normalize(load_raw())
