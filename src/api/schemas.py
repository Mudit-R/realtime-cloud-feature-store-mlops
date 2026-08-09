from pydantic import BaseModel, Field
from typing import List, Dict, Any, Optional


class HealthResponse(BaseModel):
    status: str
    project_name: str
    gcp_project_id: str
    driver_model_loaded: bool
    vehicle_model_loaded: bool
    feature_store_status: str
    uptime_seconds: float


class DriverRiskRequest(BaseModel):
    driver_id: str = Field(..., json_schema_extra={"example": "D04"})
    harsh_brake_rate: Optional[float] = Field(None, json_schema_extra={"example": 4.5})
    rapid_accel_rate: Optional[float] = Field(None, json_schema_extra={"example": 3.2})
    harsh_turn_rate: Optional[float] = Field(None, json_schema_extra={"example": 2.1})
    overspeed_50_pct: Optional[float] = Field(None, json_schema_extra={"example": 12.0})
    overspeed_65_pct: Optional[float] = Field(None, json_schema_extra={"example": 2.5})
    night_trip_pct: Optional[float] = Field(None, json_schema_extra={"example": 6.0})
    speed_compliance_score: Optional[float] = Field(None, json_schema_extra={"example": 88.5})
    experience_years: Optional[int] = Field(None, json_schema_extra={"example": 6})
    rating: Optional[float] = Field(None, json_schema_extra={"example": 4.6})
    avg_speed_kmh: Optional[float] = Field(None, json_schema_extra={"example": 34.0})
    max_speed_kmh: Optional[float] = Field(None, json_schema_extra={"example": 58.0})


class DriverRiskResponse(BaseModel):
    driver_id: str
    predicted_safety_score: float
    risk_tier: str
    accident_probability_pct: float
    ubi_premium_discount_pct: float
    feature_store_latency_ms: float
    inference_latency_ms: float
    total_latency_ms: float
    coaching_recommendation: List[str]


class VehicleRULRequest(BaseModel):
    vehicle_id: str = Field(..., json_schema_extra={"example": "V03"})
    vibration_rms: Optional[float] = Field(None, json_schema_extra={"example": 0.68})
    vibration_p95: Optional[float] = Field(None, json_schema_extra={"example": 1.15})
    gyro_jitter: Optional[float] = Field(None, json_schema_extra={"example": 19.2})
    brake_judder: Optional[float] = Field(None, json_schema_extra={"example": 0.92})
    odometer_km: Optional[int] = Field(None, json_schema_extra={"example": 28000})
    days_since_service: Optional[int] = Field(None, json_schema_extra={"example": 48})
    manufacturing_year: Optional[int] = Field(None, json_schema_extra={"example": 2022})


class VehicleRULResponse(BaseModel):
    vehicle_id: str
    predicted_rul_days: int
    health_index: float
    urgency_status: str
    primary_fault_diagnosis: str
    feature_store_latency_ms: float
    inference_latency_ms: float
    total_latency_ms: float


class CrashTriageRequest(BaseModel):
    acc_x: float = Field(..., json_schema_extra={"example": 0.8})
    acc_y: float = Field(..., json_schema_extra={"example": -4.8})
    acc_z: float = Field(..., json_schema_extra={"example": 16.2})
    gyro_x: float = Field(..., json_schema_extra={"example": 12.0})
    gyro_y: float = Field(..., json_schema_extra={"example": 48.5})
    gyro_z: float = Field(..., json_schema_extra={"example": 62.0})
    speed_kmh: float = Field(..., json_schema_extra={"example": 36.0})
    phone_mount: Optional[str] = Field("Handlebar_Mount", json_schema_extra={"example": "Handlebar_Mount"})


class CrashTriageResponse(BaseModel):
    event_type: str
    severity: str
    emergency_dispatch_required: bool
    confidence_score: float
    peak_g_force: float
    speed_at_impact_kmh: float
    reconstruction_narrative: str


class UBICalculationRequest(BaseModel):
    driver_id: str = Field(..., json_schema_extra={"example": "D01"})
    base_annual_premium_inr: float = Field(12000.0, json_schema_extra={"example": 12000.0})
    safety_score: Optional[float] = Field(None, json_schema_extra={"example": 92.5})
    night_driving_pct: Optional[float] = Field(None, json_schema_extra={"example": 4.0})


class UBICalculationResponse(BaseModel):
    driver_id: str
    base_annual_premium_inr: float
    adjusted_premium_inr: float
    discount_or_surcharge_pct: float
    annual_savings_inr: float
    actuarial_tier: str


class DriftAnalysisResponse(BaseModel):
    drift_status: str
    max_psi: float
    drifted_features_count: int
    drifted_features: List[str]
    feature_details: Dict[str, Any]
    retraining_triggered: bool
