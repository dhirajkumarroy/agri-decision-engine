from pydantic import BaseModel, Field

class CropRequest(BaseModel):
    N: float = Field(..., gt=0)
    P: float = Field(..., gt=0)
    K: float = Field(..., gt=0)
    temperature: float
    humidity: float
    ph: float
    rainfall: float

class CropResponse(BaseModel):
    recommended_crop: str
