from pathlib import Path

import joblib
import pandas as pd

MODEL_PATH = Path("models/irrigation_model_v2.pkl")
COLUMNS_PATH = Path("models/model_columns.pkl")

model = joblib.load(MODEL_PATH)


def _load_columns():
    if COLUMNS_PATH.exists():
        return joblib.load(COLUMNS_PATH)

    feature_names = getattr(model, "feature_names_in_", None)
    if feature_names is not None:
        return list(feature_names)

    raise RuntimeError(
        "Irrigation model columns are unavailable. Save model_columns.pkl or retrain with pandas column names."
    )


MODEL_COLUMNS = _load_columns()


def _normalize_key(value):
    return str(value).strip().lower().replace(" ", "_")


def _match_one_hot_column(prefix, raw_value):
    if raw_value is None:
        return None

    target = _normalize_key(raw_value)
    for column in MODEL_COLUMNS:
        if not column.startswith(prefix):
            continue
        encoded_value = _normalize_key(column[len(prefix):])
        if encoded_value == target:
            return column
    return None


def prepare_input(data):
    input_row = {column: 0 for column in MODEL_COLUMNS}

    input_row["Soil_Moisture"] = float(data["soil_moisture"])
    input_row["Temperature_C"] = float(data["temperature"])
    input_row["Humidity"] = float(data["humidity"])
    input_row["Rainfall_mm"] = float(data["rain"])

    crop_column = _match_one_hot_column("Crop_Type_", data.get("crop_type"))
    if crop_column:
        input_row[crop_column] = 1

    stage_column = _match_one_hot_column("Crop_Growth_Stage_", data.get("growth_stage"))
    if stage_column:
        input_row[stage_column] = 1

    return pd.DataFrame([input_row], columns=MODEL_COLUMNS)


def predict_irrigation(data):
    required_fields = ["soil_moisture", "temperature", "humidity", "rain"]
    if not isinstance(data, dict):
        return {"error": "Missing fields"}

    if not all(field in data for field in required_fields):
        return {"error": "Missing fields"}

    try:
        sample_df = prepare_input(data)
        model_pred = model.predict(sample_df)[0]
    except (TypeError, ValueError):
        return {"error": "Invalid input values"}

    return {
        "irrigation": "yes" if int(model_pred) == 1 else "no",
        "model_version": "v2",
        "used_crop_type": data.get("crop_type"),
        "used_growth_stage": data.get("growth_stage"),
    }
