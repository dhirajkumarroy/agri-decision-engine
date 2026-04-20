import pandas as pd
from sklearn.model_selection import train_test_split
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import accuracy_score
from sklearn.preprocessing import LabelEncoder
import joblib
import os

# Load dataset
df = pd.read_csv("data/crop_recommendation.csv")

# Encode target labels
encoder = LabelEncoder()
df["label_encoded"] = encoder.fit_transform(df["label"])

# Split features & target
X = df.drop(["label", "label_encoded"], axis=1)
y = df["label_encoded"]

# Split data
X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)

# Train model
model = RandomForestClassifier(n_estimators=200, random_state=42)
model.fit(X_train, y_train)

# Evaluate
y_pred = model.predict(X_test)
acc = accuracy_score(y_test, y_pred)
print(f"✅ Model trained successfully with accuracy: {acc:.2f}")

# Create folder if missing
os.makedirs("models", exist_ok=True)

# Save model & encoder
joblib.dump(model, "models/crop_model.pkl")
joblib.dump(encoder, "models/label_encoder.pkl")
print("📦 Model & encoder saved to models/ folder")
