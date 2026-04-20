import os
import json
import numpy as np
import tensorflow as tf
from PIL import Image

# =========================
# PATH CONFIG
# =========================
BASE_DIR = os.path.dirname(os.path.abspath(__file__))

MODEL_PATH = os.path.join(BASE_DIR, "../models/disease/Smart_Farming_DL_Model.h5")
CLASS_PATH = os.path.join(BASE_DIR, "../models/disease/class_names.json")

# =========================
# DISEASE TREATMENT INFO
# =========================
DISEASE_INFO = {
    "American Bollworm on Cotton": {
        "treatment": "Spray Chlorpyrifos 20 EC or Cypermethrin. Use pheromone traps for monitoring.",
        "prevention": "Early sowing, crop rotation, and destroying crop residues after harvest."
    },
    "Anthracnose on Cotton": {
        "treatment": "Apply Carbendazim or Mancozeb fungicide spray.",
        "prevention": "Use certified disease-free seeds. Avoid waterlogging."
    },
    "Army worm": {
        "treatment": "Spray Emamectin Benzoate or Spinosad insecticide.",
        "prevention": "Regular field monitoring, use of light traps."
    },
    "Becterial Blight in Rice": {
        "treatment": "Spray Streptomycin + Tetracycline or Copper Oxychloride.",
        "prevention": "Use resistant varieties, avoid excessive nitrogen fertilizer."
    },
    "Brownspot": {
        "treatment": "Apply Mancozeb or Propiconazole fungicide.",
        "prevention": "Balanced nutrition, especially potassium. Avoid water stress."
    },
    "Common_Rust": {
        "treatment": "Spray Propiconazole or Tebuconazole fungicide.",
        "prevention": "Plant resistant hybrids, early planting."
    },
    "Cotton Aphid": {
        "treatment": "Spray Imidacloprid or Acetamiprid insecticide.",
        "prevention": "Encourage natural predators like ladybirds. Avoid excessive nitrogen."
    },
    "Flag Smut": {
        "treatment": "Seed treatment with Carboxin + Thiram or Tebuconazole.",
        "prevention": "Use certified smut-free seeds, crop rotation."
    },
    "Gray_Leaf_Spot": {
        "treatment": "Apply Azoxystrobin or Trifloxystrobin fungicide.",
        "prevention": "Crop rotation, tillage to reduce residue, resistant hybrids."
    },
    "Healthy Maize": {
        "treatment": "No treatment needed.",
        "prevention": "Continue good agronomic practices."
    },
    "Healthy Wheat": {
        "treatment": "No treatment needed.",
        "prevention": "Continue good agronomic practices."
    },
    "Healthy cotton": {
        "treatment": "No treatment needed.",
        "prevention": "Continue good agronomic practices."
    },
    "Leaf Curl": {
        "treatment": "Spray Imidacloprid to control whitefly vector. Remove infected plants.",
        "prevention": "Use virus-free seedlings, control whitefly population."
    },
    "Leaf smut": {
        "treatment": "Seed treatment with Carbendazim or Thiram.",
        "prevention": "Use resistant varieties, clean seeds."
    },
    "Mosaic sugarcane": {
        "treatment": "No chemical cure. Remove and destroy infected plants.",
        "prevention": "Use virus-free planting material, control aphid vectors."
    },
    "RedRot sugarcane": {
        "treatment": "Treat setts with Carbendazim solution before planting.",
        "prevention": "Use resistant varieties, avoid waterlogging, crop rotation."
    },
    "RedRust sugarcane": {
        "treatment": "Spray Propiconazole or Hexaconazole fungicide.",
        "prevention": "Use disease-free planting material, remove infected leaves."
    },
    "Rice Blast": {
        "treatment": "Spray Tricyclazole or Isoprothiolane fungicide.",
        "prevention": "Balanced fertilization, avoid dense planting, use resistant varieties."
    },
    "Sugarcane Healthy": {
        "treatment": "No treatment needed.",
        "prevention": "Continue good agronomic practices."
    },
    "Tungro": {
        "treatment": "No direct cure. Control green leafhopper vector with Buprofezin.",
        "prevention": "Use resistant varieties, synchronize planting, remove infected plants."
    },
    "Wheat Brown leaf Rust": {
        "treatment": "Apply Propiconazole or Tebuconazole fungicide.",
        "prevention": "Use resistant varieties, early sowing."
    },
    "Wheat Stem fly": {
        "treatment": "Spray Chlorpyrifos or Dimethoate at tillering stage.",
        "prevention": "Early sowing, avoid late planting, use healthy seeds."
    },
    "Wheat aphid": {
        "treatment": "Spray Dimethoate or Imidacloprid insecticide.",
        "prevention": "Natural predators, avoid excessive nitrogen, timely sowing."
    },
    "Wheat black rust": {
        "treatment": "Apply Propiconazole or Mancozeb fungicide at early stage.",
        "prevention": "Resistant varieties, early sowing, crop rotation."
    },
    "Wheat leaf blight": {
        "treatment": "Spray Zineb or Mancozeb fungicide.",
        "prevention": "Seed treatment, avoid dense sowing, proper drainage."
    },
    "Wheat mite": {
        "treatment": "Spray Dicofol or Sulfur-based acaricide.",
        "prevention": "Avoid water stress, monitor fields regularly."
    },
    "Wheat powdery mildew": {
        "treatment": "Apply Propiconazole or Hexaconazole fungicide.",
        "prevention": "Avoid high humidity, use resistant varieties."
    },
    "Wheat scab": {
        "treatment": "Spray Tebuconazole at flowering stage.",
        "prevention": "Crop rotation, avoid planting after maize, resistant varieties."
    },
    "Wheat___Yellow_Rust": {
        "treatment": "Apply Propiconazole or Triadimefon fungicide urgently.",
        "prevention": "Resistant varieties, early sowing, avoid late irrigation."
    },
    "Wilt": {
        "treatment": "Drench soil with Carbendazim or Copper Oxychloride.",
        "prevention": "Crop rotation, well-drained soil, resistant varieties."
    },
    "Yellow Rust Sugarcane": {
        "treatment": "Spray Propiconazole or Hexaconazole fungicide.",
        "prevention": "Use resistant varieties, remove infected leaves."
    },
    "bacterial_blight in Cotton": {
        "treatment": "Spray Streptomycin Sulphate + Copper Oxychloride.",
        "prevention": "Use certified seeds, avoid injuries to plants."
    },
    "bollrot on Cotton": {
        "treatment": "Spray Carbendazim or Copper Oxychloride fungicide.",
        "prevention": "Control bollworm damage, proper drainage."
    },
    "bollworm on Cotton": {
        "treatment": "Spray Cypermethrin or Profenofos insecticide.",
        "prevention": "Pheromone traps, early sowing, Bt cotton varieties."
    },
    "cotton mealy bug": {
        "treatment": "Spray Profenofos or Chlorpyrifos. Release Cryptolaemus beetles.",
        "prevention": "Avoid ant activity, use clean planting material."
    },
    "cotton whitefly": {
        "treatment": "Spray Buprofezin or Spiromesifen insecticide.",
        "prevention": "Yellow sticky traps, remove infected leaves, avoid over-irrigation."
    },
    "maize ear rot": {
        "treatment": "No effective chemical post-infection. Remove infected ears.",
        "prevention": "Proper drying of grain, resistant hybrids, control stalk borers."
    },
    "maize fall armyworm": {
        "treatment": "Spray Emamectin Benzoate or Spinetoram insecticide.",
        "prevention": "Early planting, pheromone traps, biological control with Trichogramma."
    },
    "maize stem borer": {
        "treatment": "Apply Carbofuran granules in whorl or spray Chlorpyrifos.",
        "prevention": "Early planting, crop rotation, destroy crop residues."
    },
    "pink bollworm in cotton": {
        "treatment": "Spray Cypermethrin or Profenofos insecticide.",
        "prevention": "Pheromone traps, early harvest, destroy crop residues."
    },
    "red cotton bug": {
        "treatment": "Spray Malathion or Dimethoate insecticide.",
        "prevention": "Remove weeds, harvest on time to avoid boll bursting."
    },
    "thirps on  cotton": {
        "treatment": "Spray Fipronil or Imidacloprid insecticide.",
        "prevention": "Reflective mulches, avoid drought stress, early sowing."
    }
}


# =========================
# LOAD MODEL + CLASSES (ONCE)
# =========================
print("Loading disease model...")

model = tf.keras.models.load_model(MODEL_PATH)

with open(CLASS_PATH, "r") as f:
    raw = json.load(f)

# Handle both list and dict formats safely
if isinstance(raw, dict):
    class_names = [raw[str(i)] for i in range(len(raw))]
else:
    class_names = raw

print(f"Model loaded successfully ✅ | Classes: {len(class_names)}")


# =========================
# IMAGE PREPROCESSING
# =========================
def preprocess_image(image_file):
    img = Image.open(image_file).convert("RGB")
    img = img.resize((128, 128))
    img_array = np.array(img, dtype=np.float32) / 255.0
    img_array = np.expand_dims(img_array, axis=0)
    return img_array


# =========================
# PREDICTION FUNCTION
# =========================
def predict_disease(image_file):
    try:
        img_array = preprocess_image(image_file)

        prediction = model.predict(img_array)
        predicted_index = int(np.argmax(prediction[0]))
        confidence = float(np.max(prediction[0]))


        predicted_class = class_names[predicted_index]

        # Top 3 predictions for extra info
        top3_indices = np.argsort(prediction[0])[::-1][:3]
        top3 = [
            {
                "disease": class_names[i],
                "confidence": round(float(prediction[0][i]) * 100, 2)
            }
            for i in top3_indices
        ]

        # Get treatment and prevention info
        info = DISEASE_INFO.get(predicted_class, {
            "treatment": "Consult a local agricultural expert.",
            "prevention": "Monitor crops regularly and maintain good agronomic practices."
        })

        is_healthy = "healthy" in predicted_class.lower()

        return {
            "success": True,
            "disease": predicted_class,
            "confidence": round(confidence * 100, 2),
            "is_healthy": is_healthy,
            "treatment": info["treatment"],
            "prevention": info["prevention"],
            "top3": top3
        }

    except Exception as e:
        import traceback
        traceback.print_exc()
        print(f"[disease_service] ERROR: {e}")
        return {
            "success": False,
            "disease": "Detection Failed",
            "confidence": 0,
            "is_healthy": False,
            "treatment": "Please try uploading a clearer image.",
            "prevention": "Ensure the image shows the affected leaf clearly.",
            "error": str(e),
            "top3": []
        }