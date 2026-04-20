# Farmpilot AI — Intelligent Farming Platform

An AI-powered smart farming platform that helps farmers optimize crop selection, detect plant diseases, manage irrigation, and get fertilizer recommendations using machine learning and real-time data.

---

## Features

- **Crop Recommendation** — Predicts the best crop based on soil nutrients (N, P, K), pH, rainfall, temperature, and humidity using a RandomForest model
- **Disease Detection** — Identifies plant diseases from leaf images using a deep learning model (TensorFlow/Keras)
- **Irrigation Prediction** — Recommends whether irrigation is needed based on soil moisture, weather, and growth stage
- **Fertilizer Recommendation** — Suggests the right fertilizer based on soil type, crop type, and nutrient levels
- **FarmBot AI Chat** — AI-powered farming assistant (Anthropic Claude / Google Gemini / Ollama) with streaming responses
- **Weather Integration** — Real-time weather and 7-day forecast via OpenWeather API
- **IoT Sensor Support** — MQTT-based real-time sensor data ingestion and irrigation control
- **User Authentication** — JWT-based auth with prediction history and chat history
- **Admin Panel** — Dashboard for user management and prediction analytics

---

## Tech Stack

| Layer | Technology |
|---|---|
| ML Backend | Python, FastAPI, scikit-learn, TensorFlow/Keras |
| API Backend | Node.js 20, Express.js 4 |
| Database | MongoDB 7 (Mongoose) |
| AI Providers | Anthropic Claude, Google Gemini, Ollama |
| IoT Messaging | MQTT (Eclipse Mosquitto) |
| Auth | JWT + bcryptjs |
| Containerization | Docker, Docker Compose |

---

## Project Structure

```
ai-crop-recommendation-ml/
├── app/                        # FastAPI ML service (Python)
│   ├── main.py                 # FastAPI entry point
│   ├── service.py              # Crop prediction service
│   ├── disease_service.py      # Disease detection service
│   ├── fertilizer_service.py   # Fertilizer recommendation
│   ├── irrigation_service.py   # Irrigation prediction
│   ├── weather_service.py      # OpenWeather integration
│   ├── crop_requirements.py    # Crop info database (150+ crops)
│   ├── templates/              # Jinja2 HTML templates
│   ├── static/                 # CSS, JS, assets
│   ├── requirements.txt
│   └── Dockerfile
│
├── backend/                    # Express.js API service (Node.js)
│   ├── server.js               # Express entry point
│   ├── db.js                   # MongoDB connection
│   ├── routes/                 # API route handlers
│   ├── services/               # Business logic
│   ├── middleware/             # Auth, rate limiting, caching
│   ├── config/                 # App config & logger
│   ├── .env.example            # Environment variable template
│   ├── package.json
│   └── Dockerfile
│
├── models/                     # Pre-trained ML models (git-ignored)
│   ├── crop_model.pkl
│   ├── fertilizer_model.pkl
│   ├── irrigation_model_v2.pkl
│   └── disease/Smart_Farming_DL_Model.h5
│
├── data/                       # Training datasets
├── train_model.py              # Crop model training script
├── train_fertilizer_model.py   # Fertilizer model training script
├── docker-compose.yml
└── mosquitto.conf
```

---

## Getting Started

### Prerequisites

- Docker & Docker Compose
- Node.js 20+ (for local dev)
- Python 3.11+ (for local dev)
- MongoDB (handled by Docker)

### Quick Start (Docker)

```bash
# 1. Clone the repo
git clone https://github.com/dhirajkumarroy/agri-decision-engine.git
cd agri-decision-engine

# 2. Set up environment variables
cp backend/.env.example backend/.env
# Edit backend/.env and fill in required values (see below)

# 3. Start all services
docker-compose up -d
```

Services will be available at:
- Node.js API: `http://localhost:3000`
- FastAPI ML: `http://localhost:8000`
- MongoDB: `localhost:27017`
- MQTT Broker: `localhost:1883`

### Local Development

**ML Service (Python):**
```bash
python3.11 -m venv venv
source venv/bin/activate
pip install -r app/requirements.txt
uvicorn app.main:app --reload --port 8000
```

**Backend (Node.js):**
```bash
cd backend
npm install
npm run dev
```

---

## Environment Variables

Copy `backend/.env.example` to `backend/.env` and configure:

| Variable | Description |
|---|---|
| `MONGODB_URI` | MongoDB connection string |
| `JWT_SECRET` | Secret key (min 32 characters) |
| `OPENWEATHER_API_KEY` | OpenWeatherMap API key |
| `ANTHROPIC_API_KEY` | Anthropic Claude API key |
| `AI_PROVIDER` | `anthropic`, `gemini`, or `ollama` |
| `GEMINI_API_KEY` | Google Gemini API key (if using Gemini) |
| `ML_BACKEND_URL` | FastAPI URL (default: `http://localhost:8000`) |
| `SMTP_HOST` | Email server host |
| `SMTP_USER` | Email username |
| `SMTP_PASS` | Email password |

> **Never commit `.env` files or hardcoded API keys.**

---

## API Endpoints

### Authentication
| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/auth/register` | Register user |
| POST | `/api/auth/login` | Login, returns JWT |
| POST | `/api/auth/refresh` | Refresh token |

### Crop & Predictions
| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/crops/predict` | Crop recommendation |
| POST | `/api/predict/disease` | Disease detection (image upload) |
| POST | `/api/predict/irrigation` | Irrigation prediction |
| POST | `/api/predict-fertilizer` | Fertilizer recommendation |
| GET | `/api/crops/list` | All supported crops |
| GET | `/api/crops/info/:crop` | Detailed crop requirements |

### Weather
| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/live-weather?lat=&lon=` | Current weather by coordinates |
| GET | `/api/weather-by-city?city=` | Current weather by city |
| GET | `/api/forecast?lat=&lon=` | 7-day forecast |

### AI Chat
| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/ai/chat` | FarmBot streaming chat (SSE) |
| POST | `/api/ai/explain` | One-shot ML result explanation |
| GET | `/api/ai/history` | User's chat history |
| DELETE | `/api/ai/chat/:sessionId` | Clear session |

### Health
| Method | Endpoint | Description |
|---|---|---|
| GET | `/health` | Service status |
| GET | `/health/detailed` | Full system health with cache stats |

---

## ML Models

The pre-trained models are not included in the repo (too large). To retrain:

```bash
# Retrain crop recommendation model
python train_model.py

# Retrain fertilizer model
python train_fertilizer_model.py
```

Models will be saved to the `models/` directory.

---

## Architecture

```
                    ┌─────────────────┐
                    │   Browser / App  │
                    └────────┬────────┘
                             │
                    ┌────────▼────────┐
                    │  Express API    │  :3000
                    │  (Node.js)      │
                    └──┬──────────┬──┘
                       │          │
           ┌───────────▼──┐  ┌────▼───────────┐
           │  FastAPI ML  │  │    MongoDB      │
           │  (Python)    │  │  (User data,   │
           │  :8000       │  │   predictions) │
           └──────────────┘  └────────────────┘
                       │
           ┌───────────▼──────────┐
           │  MQTT Broker         │
           │  (IoT sensors)       │
           └──────────────────────┘
```

---

## License

This project is for educational/capstone purposes.
