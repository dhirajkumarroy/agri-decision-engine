from fastapi import FastAPI, Request, Form, UploadFile, File, HTTPException
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
import requests
import os

from app.service import CropService
from app.weather_service import get_weather_data as get_weather
from app.fertilizer_service import FertilizerService
from app.disease_service import predict_disease
from app.irrigation_service import predict_irrigation
from app.crop_requirements import crop_requirements

# ====================================
# LOAD ENV
# ====================================
load_dotenv()
OPENWEATHER_API_KEY = os.getenv("OPENWEATHER_API_KEY", "")

# ====================================
# FASTAPI INIT
# ====================================
app = FastAPI(title="Farmpilot AI — Smart Advisor")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Guard: redirect Node.js-only routes to the correct port ──────────────────
# If someone opens localhost:8000 directly, /api/auth/* returns a clear message
# instead of a confusing 404.
@app.api_route("/api/auth/{path:path}", methods=["GET","POST","PUT","PATCH","DELETE"])
async def auth_redirect_guard(path: str):
    return JSONResponse(
        status_code=421,
        content={
            "error": "Wrong port",
            "message": f"/api/auth/{path} is handled by the Node.js backend. "
                       "Open http://localhost:3000 — not http://localhost:8000.",
            "correct_url": f"http://localhost:3000/api/auth/{path}"
        }
    )

app.mount("/static", StaticFiles(directory="app/static"), name="static")
templates = Jinja2Templates(directory="app/templates")

crop_service = CropService()
fert_service = FertilizerService()


# ====================================
# UI ROUTES
# ====================================
@app.get("/", response_class=HTMLResponse)
def home(request: Request):
    return templates.TemplateResponse(request=request, name="home.html")


@app.get("/predict", response_class=HTMLResponse)
def predict_page(request: Request):
    return templates.TemplateResponse(request=request, name="predict.html")


@app.get("/dashboard", response_class=HTMLResponse)
def dashboard_page(request: Request):
    return templates.TemplateResponse(request=request, name="dashboard.html")


@app.get("/iot-center", response_class=HTMLResponse)
def iot_center_page(request: Request):
    return templates.TemplateResponse(request=request, name="iot_center.html")


@app.get("/about", response_class=HTMLResponse)
def about_page(request: Request):
    return templates.TemplateResponse(request=request, name="about.html")


@app.get("/contact", response_class=HTMLResponse)
def contact_page(request: Request):
    return templates.TemplateResponse(request=request, name="contact.html")


@app.get("/crop-info", response_class=HTMLResponse)
def crop_info_page(request: Request):
    return templates.TemplateResponse(request=request, name="crop_info.html")


# ====================================
# WEATHER APIS
# ====================================
@app.get("/api/live-weather")
def get_live_weather(lat: float, lon: float):
    if not OPENWEATHER_API_KEY:
        return JSONResponse(status_code=503, content={"error": "Weather API key not configured."})
    url = (
        f"https://api.openweathermap.org/data/2.5/weather"
        f"?lat={lat}&lon={lon}&appid={OPENWEATHER_API_KEY}&units=metric"
    )
    try:
        res = requests.get(url, timeout=8).json()
    except requests.RequestException:
        return JSONResponse(status_code=503, content={"error": "Weather service unavailable."})

    if "main" not in res:
        return JSONResponse(status_code=502, content={"error": "Invalid response from weather API."})

    return {
        "city": res.get("name", "Unknown"),
        "temperature": res["main"]["temp"],
        "humidity": res["main"]["humidity"],
        "rainfall": res.get("rain", {}).get("1h", 0),
        "description": res["weather"][0]["description"].title() if res.get("weather") else "N/A",
        "wind_speed": res.get("wind", {}).get("speed", 0),
        "feels_like": res["main"].get("feels_like", res["main"]["temp"]),
    }


@app.get("/api/weather-by-city")
def get_weather_by_city(city: str):
    if not OPENWEATHER_API_KEY:
        return JSONResponse(status_code=503, content={"error": "Weather API key not configured."})
    url = (
        f"https://api.openweathermap.org/data/2.5/weather"
        f"?q={city}&appid={OPENWEATHER_API_KEY}&units=metric"
    )
    try:
        res = requests.get(url, timeout=8).json()
    except requests.RequestException:
        return JSONResponse(status_code=503, content={"error": "Weather service unavailable."})

    if "main" not in res:
        return JSONResponse(status_code=404, content={"error": f"City '{city}' not found."})

    return {
        "city": res.get("name", city),
        "temperature": res["main"]["temp"],
        "humidity": res["main"]["humidity"],
        "rainfall": res.get("rain", {}).get("1h", 0),
        "description": res["weather"][0]["description"].title() if res.get("weather") else "N/A",
        "wind_speed": res.get("wind", {}).get("speed", 0),
        "feels_like": res["main"].get("feels_like", res["main"]["temp"]),
    }


@app.get("/api/forecast")
def get_forecast(lat: float, lon: float):
    if not OPENWEATHER_API_KEY:
        return JSONResponse(status_code=503, content={"error": "Weather API key not configured."})
    url = (
        f"https://api.openweathermap.org/data/2.5/forecast"
        f"?lat={lat}&lon={lon}&appid={OPENWEATHER_API_KEY}&units=metric&cnt=7"
    )
    try:
        res = requests.get(url, timeout=8).json()
    except requests.RequestException:
        return JSONResponse(status_code=503, content={"error": "Weather service unavailable."})

    if "list" not in res:
        return JSONResponse(status_code=502, content={"error": "Invalid forecast response."})

    forecast = []
    for item in res["list"]:
        forecast.append({
            "date": item["dt_txt"][:10],
            "temperature": item["main"]["temp"],
            "humidity": item["main"]["humidity"],
            "rain": item.get("rain", {}).get("3h", 0),
            "description": item["weather"][0]["description"].title() if item.get("weather") else "N/A",
        })

    return {"forecast": forecast}


# ====================================
# CROP INFO API
# ====================================
@app.get("/api/crop-info/{crop_name}")
def get_crop_info(crop_name: str):
    crop = crop_name.lower().strip()
    info = crop_requirements.get(crop)
    if not info:
        available = list(crop_requirements.keys())
        return JSONResponse(
            status_code=404,
            content={"error": f"Crop '{crop_name}' not found.", "available_crops": available}
        )
    return {
        "crop_name": crop,
        "info": info
    }


# ====================================
# CROP PREDICTION
# ====================================
@app.post("/predict", response_class=HTMLResponse)
@app.post("/predict-crop", response_class=HTMLResponse)
async def predict_crop(
    request: Request,
    city: str = Form(...),
    N: float = Form(...),
    P: float = Form(...),
    K: float = Form(...),
    ph: float = Form(...),
    rainfall: float = Form(...)
):
    try:
        weather = get_weather(city)

        data = {
            "city": city,
            "N": N,
            "P": P,
            "K": K,
            "ph": ph,
            "rainfall": rainfall,
            "temperature": weather["temperature"],
            "humidity": weather["humidity"]
        }

        crop_predictions = crop_service.predict_top_crops(data)

        result = {
            "live_weather": weather,
            "top_recommendations": crop_predictions
        }

        return templates.TemplateResponse(
            request=request,
            name="predict.html",
            context={"result": result, "active_tab": "crop"}
        )

    except Exception as e:
        return templates.TemplateResponse(
            request=request,
            name="predict.html",
            context={"error": str(e), "active_tab": "crop"}
        )


# ====================================
# FERTILIZER API
# ====================================
@app.post("/api/predict-fertilizer")
async def predict_fertilizer(payload: dict):
    try:
        fert = fert_service.predict_fertilizer(payload)
        return {"recommended_fertilizer": fert}
    except Exception as e:
        return JSONResponse(status_code=500, content={"error": str(e)})


# ====================================
# DISEASE DETECTION
# ====================================
@app.post("/predict-disease", response_class=HTMLResponse)
async def predict_disease_route(request: Request, file: UploadFile = File(...)):
    # Validate file type
    allowed_types = {"image/jpeg", "image/png", "image/jpg", "image/webp"}
    if file.content_type not in allowed_types:
        return templates.TemplateResponse(
            request=request,
            name="predict.html",
            context={"error": "Please upload a valid image file (JPEG, PNG, WebP).", "active_tab": "disease"}
        )

    try:
        disease_result = predict_disease(file.file)
        return templates.TemplateResponse(
            request=request,
            name="predict.html",
            context={"disease_result": disease_result, "active_tab": "disease"}
        )
    except Exception as e:
        return templates.TemplateResponse(
            request=request,
            name="predict.html",
            context={"error": str(e), "active_tab": "disease"}
        )


# ====================================
# IRRIGATION API
# ====================================
@app.post("/predict-irrigation")
async def predict_irrigation_api(data: dict):
    try:
        result = predict_irrigation(data)
        if isinstance(result, dict) and "error" in result:
            return JSONResponse(status_code=400, content=result)
        return {"irrigation": result}
    except Exception as e:
        return JSONResponse(status_code=500, content={"error": str(e)})
