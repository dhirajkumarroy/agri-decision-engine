import requests
import os
from fastapi import HTTPException

OPENWEATHER_API_KEY = os.getenv("OPENWEATHER_API_KEY")

def get_weather_data(city: str):
    """
    Fetches real-time weather data for a given city using OpenWeather API.
    """
    url = f"http://api.openweathermap.org/data/2.5/weather?q={city}&appid={OPENWEATHER_API_KEY}&units=metric"

    response = requests.get(url)
    if response.status_code != 200:
        raise HTTPException(status_code=404, detail="City not found or API request failed.")

    data = response.json()

    # Extract relevant info
    weather_info = {
        "city": city,
        "temperature": data["main"]["temp"],
        "humidity": data["main"]["humidity"],
        "description": data["weather"][0]["description"],
        "wind_speed": data["wind"]["speed"]
    }

    return weather_info