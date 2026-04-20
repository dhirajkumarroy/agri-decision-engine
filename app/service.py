
import joblib
import numpy as np
import pandas as pd
import os

class CropService:
    def __init__(self):
        model_path = "models/crop_model.pkl"
        encoder_path = "models/label_encoder.pkl"

        if not os.path.exists(model_path):
            raise FileNotFoundError(f"❌ Model not found at {model_path}. Run train_model.py first.")
        if not os.path.exists(encoder_path):
            raise FileNotFoundError(f"❌ Encoder not found at {encoder_path}. Run train_model.py first.")

        # ✅ Load with joblib
        self.model = joblib.load(model_path)
        self.encoder = joblib.load(encoder_path)

    def predict_crop(self, data: dict):
        """Predict single best crop"""
        input_data = np.array([[data["N"], data["P"], data["K"],
                                data["temperature"], data["humidity"],
                                data["ph"], data["rainfall"]]])
        prediction = self.model.predict(input_data)[0]
        return self.encoder.inverse_transform([prediction])[0]

    def predict_top_crops(self, data: dict, top_n=3):
        """Return top N crops with confidence scores"""
        input_data = np.array([[data["N"], data["P"], data["K"],
                                data["temperature"], data["humidity"],
                                data["ph"], data["rainfall"]]])

        probs = self.model.predict_proba(input_data)[0]
        crops = self.encoder.inverse_transform(np.arange(len(probs)))

        df = pd.DataFrame({
            "crop": crops,
            "probability": probs
        }).sort_values(by="probability", ascending=False)

        return df.head(top_n).to_dict(orient="records")
