import joblib
import numpy as np

class FertilizerService:

    def __init__(self):
        self.model = joblib.load("models/fertilizer_model.pkl")
        self.soil_encoder = joblib.load("models/soil_encoder.pkl")
        self.crop_encoder = joblib.load("models/crop_encoder.pkl")
        self.fert_encoder = joblib.load("models/fertilizer_encoder.pkl")

    def predict_fertilizer(self, data):

        soil = self.soil_encoder.transform([data["soil_type"]])[0]
        crop = self.crop_encoder.transform([data["crop_type"]])[0]

        input_data = np.array([[ 
            data["temperature"],
            data["humidity"],
            data["moisture"],
            soil,
            crop,
            data["nitrogen"],
            data["potassium"],
            data["phosphorous"]
        ]])

        pred = self.model.predict(input_data)[0]

        fertilizer = self.fert_encoder.inverse_transform([pred])[0]

        return fertilizer