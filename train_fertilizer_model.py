import pandas as pd
import joblib
import os

from sklearn.model_selection import train_test_split
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import accuracy_score

print("🚀 Starting fertilizer model training...\n")

# =========================
# Load dataset
# =========================
df = pd.read_csv("data/fertilizer_recommendation.csv")

print("📊 Dataset loaded")
print("Shape:", df.shape)
print()

# =========================
# Column check
# =========================
print("🧾 Columns:")
print(df.columns)
print()

# Fix column typo if exists
if "Temparature" in df.columns:
    df.rename(columns={"Temparature": "Temperature"}, inplace=True)
    print("✔ Column 'Temparature' renamed to 'Temperature'\n")

# =========================
# Data types
# =========================
print("📌 Data types:")
print(df.dtypes)
print()

# =========================
# Missing values
# =========================
print("🔍 Missing values:")
print(df.isnull().sum())
print()

# =========================
# Duplicate rows
# =========================
duplicates = df.duplicated().sum()
print("🔁 Duplicate rows:", duplicates)

if duplicates > 0:
    df = df.drop_duplicates()
    print("✔ Duplicates removed")
    print("New shape:", df.shape)
print()

# =========================
# Fertilizer distribution
# =========================
print("🌱 Fertilizer distribution:")
print(df["Fertilizer Name"].value_counts())
print()

# =========================
# Check inconsistent NPK patterns
# =========================
print("🧪 Checking NPK → Fertilizer consistency...")

npk_conflicts = (
    df.groupby(["Nitrogen", "Phosphorous", "Potassium"])["Fertilizer Name"]
    .nunique()
)

conflicts = npk_conflicts[npk_conflicts > 1]

print("Conflicting NPK combinations:", len(conflicts))
print()

if len(conflicts) > 0:
    print("⚠ Example conflicts:")
    print(conflicts.head())
    print()

# =========================
# Keep majority fertilizer per NPK
# =========================
print("🔧 Cleaning inconsistent mappings...")

df = (
    df.groupby(["Nitrogen", "Phosphorous", "Potassium"])
    .agg({"Fertilizer Name": lambda x: x.mode()[0]})
    .reset_index()
)

print("New dataset shape after cleaning:", df.shape)
print()

# =========================
# Feature selection
# =========================
X = df[["Nitrogen", "Phosphorous", "Potassium"]]
y = df["Fertilizer Name"]

print("Features used:")
print(X.head())
print()

# =========================
# Train test split
# =========================
print("✂ Splitting dataset...")

X_train, X_test, y_train, y_test = train_test_split(
    X,
    y,
    test_size=0.2,
    stratify=y,
    random_state=42
)

print("Training samples:", len(X_train))
print("Testing samples:", len(X_test))
print()

# =========================
# Model training
# =========================
print("🤖 Training RandomForest model...")

model = RandomForestClassifier(
    n_estimators=400,
    max_depth=15,
    random_state=42,
    n_jobs=-1
)

model.fit(X_train, y_train)

print("✔ Model training completed\n")

# =========================
# Prediction
# =========================
print("🔮 Running predictions...")

pred = model.predict(X_test)

acc = accuracy_score(y_test, pred)

print("✅ Fertilizer model accuracy:", round(acc, 4))
print()

# =========================
# Save model
# =========================
print("💾 Saving model...")

os.makedirs("models", exist_ok=True)

joblib.dump(model, "models/fertilizer_model.pkl")

print("📦 Model saved at models/fertilizer_model.pkl")
print("\n🎉 Training finished successfully!")