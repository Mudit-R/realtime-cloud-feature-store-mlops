import time
import json
import os
import asyncio
import numpy as np
import pandas as pd
from typing import Dict
from fastapi import APIRouter, Request, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.responses import HTMLResponse, FileResponse
from src.api.schemas import (
    HealthResponse,
    DriverRiskRequest,
    DriverRiskResponse,
    VehicleRULRequest,
    VehicleRULResponse,
    CrashTriageRequest,
    CrashTriageResponse,
    UBICalculationRequest,
    UBICalculationResponse,
    DriftAnalysisResponse
)
from src.models.crash_detector import CrashDetector
from src.models.explainer import TelematicsExplainer
from src.features.store import FeatureStoreManager
from src.data.telemetry_streamer import TelematicsStreamEngine

router = APIRouter()

# Active vehicle streaming engines
ACTIVE_STREAMERS: Dict[str, TelematicsStreamEngine] = {}


def get_or_create_streamer(vehicle_id: str) -> TelematicsStreamEngine:
    if vehicle_id not in ACTIVE_STREAMERS:
        ACTIVE_STREAMERS[vehicle_id] = TelematicsStreamEngine(vehicle_id=vehicle_id)
    return ACTIVE_STREAMERS[vehicle_id]


def get_feature_store(request: Request) -> FeatureStoreManager:
    if hasattr(request.app.state, "feature_store_mgr") and request.app.state.feature_store_mgr is not None:
        return request.app.state.feature_store_mgr
    return FeatureStoreManager()


@router.get("/", response_class=HTMLResponse)
async def serve_dashboard():
    static_html = "src/api/static/index.html"
    if os.path.exists(static_html):
        with open(static_html, "r", encoding="utf-8") as f:
            return HTMLResponse(content=f.read())
    return HTMLResponse(content="<h1>PulseStar Telematics & MLOps Platform</h1><p>Static index.html not found</p>")


@router.get("/health", response_model=HealthResponse)
async def health_check(request: Request):
    state = request.app.state
    start_time = getattr(state, "start_time", time.time())
    return HealthResponse(
        status="healthy",
        project_name="PulseStar Telematics & AI MLOps Platform",
        gcp_project_id=os.environ.get("GCP_PROJECT_ID", "project-02ed109f-3be3-43b8-866"),
        driver_model_loaded=hasattr(state, "driver_model") and state.driver_model is not None,
        vehicle_model_loaded=hasattr(state, "vehicle_model") and state.vehicle_model is not None,
        feature_store_status="online_sub_3ms",
        uptime_seconds=round(time.time() - start_time, 2)
    )


# -------------------------------------------------------------
# REST Endpoints for Neobrutalist Web Dashboard
# -------------------------------------------------------------
@router.get("/api/fleet/summary")
async def get_fleet_summary(request: Request):
    fixtures = getattr(request.app.state, "fixtures", {})
    return fixtures.get("fleet_summary", {})


@router.get("/api/drivers")
async def get_all_drivers(request: Request):
    fixtures = getattr(request.app.state, "fixtures", {})
    return fixtures.get("processed_drivers", [])


@router.get("/api/vehicles")
async def get_all_vehicles(request: Request):
    fixtures = getattr(request.app.state, "fixtures", {})
    return fixtures.get("processed_vehicles", [])


@router.get("/api/trips/{trip_id}/telemetry")
async def get_trip_telemetry(trip_id: str, request: Request):
    fixtures = getattr(request.app.state, "fixtures", {})
    trip_map = fixtures.get("trips_telemetry_sample", {})
    if isinstance(trip_map, dict) and trip_id in trip_map:
        return trip_map[trip_id]
    elif isinstance(trip_map, list):
        filtered = [row for row in trip_map if row.get("Trip_ID") == trip_id]
        if filtered:
            return filtered
        return trip_map[:100]
    
    # Fallback to first available trip in dictionary
    if isinstance(trip_map, dict) and len(trip_map) > 0:
        first_key = list(trip_map.keys())[0]
        return trip_map[first_key]
    return []


@router.get("/api/potholes/gis")
async def get_potholes_gis(request: Request):
    fixtures = getattr(request.app.state, "fixtures", {})
    return fixtures.get("pothole_gis_sample", [])


# -------------------------------------------------------------
# High-Frequency Real-Time WebSocket Streaming & Kinematics HUD
# -------------------------------------------------------------
@router.websocket("/ws/telematics/live/{vehicle_id}")
async def websocket_telematics_stream(websocket: WebSocket, vehicle_id: str):
    await websocket.accept()
    streamer = get_or_create_streamer(vehicle_id)
    
    async def listen_for_events():
        try:
            while True:
                data = await websocket.receive_text()
                msg = json.loads(data)
                action = msg.get("action")
                if action == "inject_event":
                    event_type = msg.get("event_type", "pothole")
                    streamer.inject_event(event_type)
        except Exception:
            pass

    listener_task = asyncio.create_task(listen_for_events())
    
    try:
        while True:
            frame = streamer.next_frame(delta_sec=0.05)
            await websocket.send_json(frame)
            await asyncio.sleep(0.05)  # 20 FPS
    except WebSocketDisconnect:
        pass
    except Exception:
        pass
    finally:
        listener_task.cancel()


@router.get("/api/telemetry/live-frame/{vehicle_id}")
async def get_live_telemetry_frame(vehicle_id: str):
    streamer = get_or_create_streamer(vehicle_id)
    return streamer.next_frame(delta_sec=0.1)


@router.post("/api/telemetry/inject-event")
async def inject_telemetry_event(request: Request):
    body = await request.json()
    vehicle_id = body.get("vehicle_id", "V01")
    event_type = body.get("event_type", "pothole")
    streamer = get_or_create_streamer(vehicle_id)
    streamer.inject_event(event_type)
    return {"status": "injected", "vehicle_id": vehicle_id, "event_type": event_type}


# -------------------------------------------------------------
# Real-Time ML Inference & Scoring Endpoints
# -------------------------------------------------------------
@router.post("/v1/predict/driver-risk", response_model=DriverRiskResponse)
async def predict_driver_risk(req: DriverRiskRequest, request: Request):
    t_start = time.time()
    fs_mgr = get_feature_store(request)
    state = request.app.state
    driver_model = getattr(state, "driver_model", None)
    driver_preprocessor = getattr(state, "driver_preprocessor", None)

    if driver_model is None or driver_preprocessor is None:
        raise HTTPException(status_code=503, detail="Driver risk model not initialized")

    t_fs_start = time.time()
    fs_data = fs_mgr.get_online_driver_features(req.driver_id)
    t_fs_end = time.time()
    fs_latency_ms = round((t_fs_end - t_fs_start) * 1000, 3)

    raw_features = {
        "Harsh_Brake_Rate_100km": req.harsh_brake_rate if req.harsh_brake_rate is not None else fs_data.get("Harsh_Brake_Rate_100km", 2.5),
        "Rapid_Accel_Rate_100km": req.rapid_accel_rate if req.rapid_accel_rate is not None else fs_data.get("Rapid_Accel_Rate_100km", 1.8),
        "Harsh_Turn_Rate_100km": req.harsh_turn_rate if req.harsh_turn_rate is not None else fs_data.get("Harsh_Turn_Rate_100km", 1.2),
        "Overspeed_50_Pct": req.overspeed_50_pct if req.overspeed_50_pct is not None else fs_data.get("Overspeed_50_Pct", 5.0),
        "Overspeed_65_Pct": req.overspeed_65_pct if req.overspeed_65_pct is not None else fs_data.get("Overspeed_65_Pct", 1.0),
        "Night_Trip_Pct": req.night_trip_pct if req.night_trip_pct is not None else fs_data.get("Night_Trip_Pct", 4.0),
        "Speed_Compliance_Score": req.speed_compliance_score if req.speed_compliance_score is not None else fs_data.get("Speed_Compliance_Score", 92.0),
        "Experience_Years": req.experience_years if req.experience_years is not None else fs_data.get("Experience_Years", 4),
        "Rating": req.rating if req.rating is not None else fs_data.get("Rating", 4.5),
        "Avg_Speed_KMH": req.avg_speed_kmh if req.avg_speed_kmh is not None else fs_data.get("Avg_Speed_KMH", 32.0),
        "Max_Speed_KMH": req.max_speed_kmh if req.max_speed_kmh is not None else fs_data.get("Max_Speed_KMH", 55.0),
    }

    t_inf_start = time.time()
    feature_df = pd.DataFrame([raw_features])
    X = driver_preprocessor.transform(feature_df)
    predicted_score = float(driver_model.predict(X)[0])
    predicted_score = max(0.0, min(100.0, round(predicted_score, 1)))
    t_inf_end = time.time()
    inf_latency_ms = round((t_inf_end - t_inf_start) * 1000, 3)

    if predicted_score >= 85.0:
        tier = "Safe & Exemplary (Low Risk)"
        accident_prob = 4.2
        discount = 25.0
    elif predicted_score >= 70.0:
        tier = "Moderate Risk"
        accident_prob = 14.8
        discount = 12.0
    elif predicted_score >= 50.0:
        tier = "Elevated Risk"
        accident_prob = 32.5
        discount = 0.0
    else:
        tier = "Critical Risk (Action Required)"
        accident_prob = 68.4
        discount = -20.0

    coaching = []
    if raw_features["Harsh_Brake_Rate_100km"] > 3.0:
        coaching.append(f"High deceleration frequency ({raw_features['Harsh_Brake_Rate_100km']:.1f}/100km). Increase forward following distance by 2 seconds.")
    if raw_features["Night_Trip_Pct"] > 15.0:
        coaching.append("Late-night route exposure >15%. Limit nocturnal high-speed corridors.")
    if raw_features["Overspeed_50_Pct"] > 10.0:
        coaching.append(f"Excessive speed violations ({raw_features['Overspeed_50_Pct']:.1f}%). Adhere to urban speed limits.")
    if not coaching:
        coaching.append("Exemplary defensive driving. Maintain smooth throttle and braking modulation.")

    total_latency_ms = round((time.time() - t_start) * 1000, 3)

    return DriverRiskResponse(
        driver_id=req.driver_id,
        predicted_safety_score=predicted_score,
        risk_tier=tier,
        accident_probability_pct=accident_prob,
        ubi_premium_discount_pct=discount,
        feature_store_latency_ms=fs_latency_ms,
        inference_latency_ms=inf_latency_ms,
        total_latency_ms=total_latency_ms,
        coaching_recommendation=coaching
    )


@router.post("/v1/predict/vehicle-rul", response_model=VehicleRULResponse)
async def predict_vehicle_rul(req: VehicleRULRequest, request: Request):
    t_start = time.time()
    fs_mgr = get_feature_store(request)
    state = request.app.state
    vehicle_model = getattr(state, "vehicle_model", None)
    vehicle_preprocessor = getattr(state, "vehicle_preprocessor", None)

    if vehicle_model is None or vehicle_preprocessor is None:
        raise HTTPException(status_code=503, detail="Vehicle RUL model not initialized")

    t_fs_start = time.time()
    fs_data = fs_mgr.get_online_vehicle_features(req.vehicle_id)
    t_fs_end = time.time()
    fs_latency_ms = round((t_fs_end - t_fs_start) * 1000, 3)

    raw_features = {
        "Vibration_RMS": req.vibration_rms if req.vibration_rms is not None else fs_data.get("Vibration_RMS", 0.45),
        "Vibration_P95": req.vibration_p95 if req.vibration_p95 is not None else fs_data.get("Vibration_P95", 0.95),
        "Gyro_Jitter": req.gyro_jitter if req.gyro_jitter is not None else fs_data.get("Gyro_Jitter", 14.5),
        "Brake_Judder": req.brake_judder if req.brake_judder is not None else fs_data.get("Brake_Judder", 0.65),
        "Odometer_KM": req.odometer_km if req.odometer_km is not None else fs_data.get("Odometer_KM", 24000),
        "Days_Since_Service": req.days_since_service if req.days_since_service is not None else fs_data.get("Days_Since_Service", 35),
        "Manufacturing_Year": req.manufacturing_year if req.manufacturing_year is not None else fs_data.get("Manufacturing_Year", 2022),
    }

    t_inf_start = time.time()
    feature_df = pd.DataFrame([raw_features])
    X = vehicle_preprocessor.transform(feature_df)
    predicted_rul = int(max(1, round(float(vehicle_model.predict(X)[0]))))
    t_inf_end = time.time()
    inf_latency_ms = round((t_inf_end - t_inf_start) * 1000, 3)

    health_idx = max(5.0, min(100.0, round((predicted_rul / 180.0) * 100.0, 1)))

    if predicted_rul < 20:
        urgency = "CRITICAL - Service Immediately (<20 days RUL)"
    elif predicted_rul < 45:
        urgency = "URGENT - Schedule Fork & Brake Inspection"
    elif predicted_rul < 90:
        urgency = "MODERATE - Normal Wear"
    else:
        urgency = "OPTIMAL - Healthy Asset"

    if raw_features["Vibration_RMS"] > 0.65:
        fault = "Front Fork Damper Seal Failure & Spring Fatigue"
    elif raw_features["Gyro_Jitter"] > 18.0:
        fault = "Steering Stem Bearing Play & Front Rim Out-of-Round"
    elif raw_features["Brake_Judder"] > 0.85:
        fault = "Front Brake Disc Rotor Warp / Uneven Pad Wear"
    else:
        fault = "Nominal Component Baseline (No Fault Detected)"

    total_latency_ms = round((time.time() - t_start) * 1000, 3)

    return VehicleRULResponse(
        vehicle_id=req.vehicle_id,
        predicted_rul_days=predicted_rul,
        health_index=health_idx,
        urgency_status=urgency,
        primary_fault_diagnosis=fault,
        feature_store_latency_ms=fs_latency_ms,
        inference_latency_ms=inf_latency_ms,
        total_latency_ms=total_latency_ms
    )


@router.post("/v1/triage/crash-event", response_model=CrashTriageResponse)
async def triage_crash_event(req: CrashTriageRequest):
    result = CrashDetector.evaluate_impact_event(
        acc_x=req.acc_x,
        acc_y=req.acc_y,
        acc_z=req.acc_z,
        gyro_x=req.gyro_x,
        gyro_y=req.gyro_y,
        gyro_z=req.gyro_z,
        speed_kmh=req.speed_kmh,
        phone_mount=req.phone_mount or "Handlebar_Mount"
    )

    return CrashTriageResponse(
        event_type=result["event_type"],
        severity=result["severity"],
        emergency_dispatch_required=result["emergency_dispatch_required"],
        confidence_score=result["confidence_score"],
        peak_g_force=result["peak_g_force"],
        speed_at_impact_kmh=result["speed_at_impact_kmh"],
        reconstruction_narrative=result["reconstruction_narrative"]
    )


@router.post("/v1/ubi/calculate-premium", response_model=UBICalculationResponse)
async def calculate_ubi_premium(req: UBICalculationRequest, request: Request):
    fs_mgr = get_feature_store(request)
    fs_data = fs_mgr.get_online_driver_features(req.driver_id)
    
    score = req.safety_score if req.safety_score is not None else fs_data.get("Safety_Score", 82.0)
    base_prem = req.base_annual_premium_inr

    if score >= 85.0:
        discount_pct = 25.0
        tier = "Tier 1: Preferred Gold (25% Savings)"
    elif score >= 75.0:
        discount_pct = 15.0
        tier = "Tier 2: Standard Silver (15% Savings)"
    elif score >= 65.0:
        discount_pct = 0.0
        tier = "Tier 3: Baseline Neutral (0% Savings)"
    else:
        discount_pct = -20.0
        tier = "Tier 4: High-Risk Surcharge (+20% Cost)"

    adjusted_prem = round(base_prem * (1.0 - (discount_pct / 100.0)), 2)
    savings = round(base_prem - adjusted_prem, 2)

    return UBICalculationResponse(
        driver_id=req.driver_id,
        base_annual_premium_inr=base_prem,
        adjusted_premium_inr=adjusted_prem,
        discount_or_surcharge_pct=discount_pct,
        annual_savings_inr=savings,
        actuarial_tier=tier
    )


@router.get("/v1/monitoring/drift", response_model=DriftAnalysisResponse)
async def get_drift_analysis(request: Request):
    state = request.app.state
    ref_df = getattr(state, "lakehouse_telemetry", None)
    if ref_df is None or ref_df.empty:
        fs_mgr = get_feature_store(request)
        ref_df = fs_mgr.telemetry_df
        if ref_df is None or ref_df.empty:
            raise HTTPException(status_code=503, detail="Lakehouse telemetry baseline not loaded")

    half = len(ref_df) // 2
    baseline = ref_df.iloc[:half]
    current = ref_df.iloc[half:]

    features = ["Acceleration_Z", "Acceleration_Y", "Acceleration_X", "Gyro_Z", "Speed_KMH"]
    drift_mon = getattr(state, "drift_monitor", None)
    if drift_mon is None:
        from src.monitoring.drift import TelematicsDriftMonitor
        drift_mon = TelematicsDriftMonitor()

    report = drift_mon.analyze_drift(baseline, current, features)

    return DriftAnalysisResponse(
        drift_status=report["drift_status"],
        max_psi=report["max_psi"],
        drifted_features_count=report["drifted_features_count"],
        drifted_features=report["drifted_features"],
        feature_details=report["feature_details"],
        retraining_triggered=(report["max_psi"] >= 0.25)
    )
