import time
import json
import os
import numpy as np
import pandas as pd
from fastapi import APIRouter, Request, HTTPException
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

router = APIRouter()


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
    return HealthResponse(
        status="healthy",
        project_name="PulseStar Telematics & AI MLOps Platform",
        gcp_project_id=os.environ.get("GCP_PROJECT_ID", "project-02ed109f-3be3-43b8-866"),
        driver_model_loaded=(state.driver_model is not None),
        vehicle_model_loaded=(state.vehicle_model is not None),
        feature_store_status="online_sub_3ms",
        uptime_seconds=round(time.time() - state.start_time, 2)
    )


# -------------------------------------------------------------
# REST Endpoints for Neobrutalist Web Dashboard
# -------------------------------------------------------------
@router.get("/api/fleet/summary")
async def get_fleet_summary(request: Request):
    return request.app.state.fixtures.get("fleet_summary", {})


@router.get("/api/drivers")
async def get_all_drivers(request: Request):
    return request.app.state.fixtures.get("processed_drivers", [])


@router.get("/api/drivers/{driver_id}")
async def get_driver_detail(driver_id: str, request: Request):
    drivers = request.app.state.fixtures.get("processed_drivers", [])
    for d in drivers:
        if d.get("Driver_ID") == driver_id:
            return d
    raise HTTPException(status_code=404, detail=f"Driver {driver_id} not found")


@router.get("/api/vehicles")
async def get_all_vehicles(request: Request):
    return request.app.state.fixtures.get("processed_vehicles", [])


@router.get("/api/vehicles/{vehicle_id}")
async def get_vehicle_detail(vehicle_id: str, request: Request):
    vehicles = request.app.state.fixtures.get("processed_vehicles", [])
    for v in vehicles:
        if v.get("Vehicle_ID") == vehicle_id:
            return v
    raise HTTPException(status_code=404, detail=f"Vehicle {vehicle_id} not found")


@router.get("/api/trips/{trip_id}/telemetry")
async def get_trip_telemetry(trip_id: str, request: Request):
    samples = request.app.state.fixtures.get("trips_telemetry_sample", {})
    if trip_id in samples:
        return samples[trip_id]
    raise HTTPException(status_code=404, detail=f"Trip telemetry sample for {trip_id} not found")


@router.get("/api/potholes/gis")
async def get_pothole_gis_points(request: Request):
    return request.app.state.fixtures.get("pothole_gis_sample", [])


# -------------------------------------------------------------
# Real-Time ML Inference & Scoring Endpoints (Feast-Backed)
# -------------------------------------------------------------
@router.post("/v1/predict/driver-risk", response_model=DriverRiskResponse)
async def predict_driver_risk(req: DriverRiskRequest, request: Request):
    t0 = time.perf_counter()
    state = request.app.state

    # 1. Online Feature Store Lookup (<3ms)
    feat_df, fs_latency = state.feature_store.get_driver_online_features([req.driver_id])
    
    # Overwrite if client passed explicit override features
    row_data = feat_df.iloc[0].to_dict()
    if req.harsh_brake_rate is not None:
        row_data["Harsh_Brake_Rate_Per_100KM"] = req.harsh_brake_rate
    if req.rapid_accel_rate is not None:
        row_data["Rapid_Accel_Rate_Per_100KM"] = req.rapid_accel_rate
    if req.harsh_turn_rate is not None:
        row_data["Harsh_Turn_Rate_Per_100KM"] = req.harsh_turn_rate
    if req.overspeed_50_pct is not None:
        row_data["Overspeed_50_Pct"] = req.overspeed_50_pct
    if req.night_trip_pct is not None:
        row_data["Night_Trip_Pct"] = req.night_trip_pct

    eval_df = pd.DataFrame([row_data])
    x_vec = state.driver_preprocessor.transform(eval_df)

    t_inf = time.perf_counter()
    if state.driver_model is not None:
        pred_score = float(state.driver_model.predict(x_vec)[0])
    else:
        pred_score = float(row_data.get("Safety_Score", 85.0))
    pred_score = float(np.clip(pred_score, 15.0, 99.0))
    inf_latency = (time.perf_counter() - t_inf) * 1000.0

    if pred_score >= 82:
        tier = "Safe & Exemplary"
        accident_prob = round(float(np.clip(100 - pred_score, 2.0, 15.0)), 1)
        ubi_discount = 25.0
    elif pred_score >= 65:
        tier = "Moderate Risk"
        accident_prob = round(float(np.clip(100 - pred_score, 15.0, 35.0)), 1)
        ubi_discount = 10.0
    else:
        tier = "High Risk / Aggressive"
        accident_prob = round(float(np.clip(100 - pred_score, 35.0, 75.0)), 1)
        ubi_discount = -20.0  # Surcharge

    coaching = []
    if float(row_data.get("Harsh_Brake_Rate_Per_100KM", 0)) > 8.0:
        coaching.append("Maintain greater trailing distance to reduce emergency stops.")
    if float(row_data.get("Rapid_Accel_Rate_Per_100KM", 0)) > 8.0:
        coaching.append("Smooth throttle application to conserve fuel and prevent wheel slippage.")
    if not coaching:
        coaching.append("Optimal driving safety compliance maintained.")

    total_latency = (time.perf_counter() - t0) * 1000.0
    return DriverRiskResponse(
        driver_id=req.driver_id,
        predicted_safety_score=round(pred_score, 1),
        risk_tier=tier,
        accident_probability_pct=accident_prob,
        ubi_premium_discount_pct=ubi_discount,
        feature_store_latency_ms=round(fs_latency, 2),
        inference_latency_ms=round(inf_latency, 2),
        total_latency_ms=round(total_latency, 2),
        coaching_recommendation=coaching
    )


@router.post("/v1/predict/vehicle-rul", response_model=VehicleRULResponse)
async def predict_vehicle_rul(req: VehicleRULRequest, request: Request):
    t0 = time.perf_counter()
    state = request.app.state

    feat_df, fs_latency = state.feature_store.get_vehicle_online_features([req.vehicle_id])
    row_data = feat_df.iloc[0].to_dict()

    if req.vibration_rms is not None:
        row_data["Vibration_RMS"] = req.vibration_rms
    if req.gyro_jitter is not None:
        row_data["Gyro_Jitter"] = req.gyro_jitter
    if req.brake_judder is not None:
        row_data["Brake_Judder"] = req.brake_judder

    eval_df = pd.DataFrame([row_data])
    x_vec = state.vehicle_preprocessor.transform(eval_df)

    t_inf = time.perf_counter()
    if state.vehicle_model is not None:
        pred_rul = int(np.clip(state.vehicle_model.predict(x_vec)[0], 3, 180))
    else:
        pred_rul = int(row_data.get("Remaining_Useful_Life_Days", 90))
    inf_latency = (time.perf_counter() - t_inf) * 1000.0

    health_idx = float(row_data.get("Health_Index", 80.0))
    if health_idx >= 80:
        urgency = "Low"
        diag = "Chassis vibrations and bearing jitter within normal operating thresholds."
    elif health_idx >= 60:
        urgency = "Medium"
        diag = "Mild progressive wear detected. Schedule routine service inspection within 14 days."
    else:
        urgency = "Immediate"
        diag = "High vibration RMS / rotational jitter breach. Ground vehicle for suspension and bearing replacement."

    total_latency = (time.perf_counter() - t0) * 1000.0
    return VehicleRULResponse(
        vehicle_id=req.vehicle_id,
        predicted_rul_days=pred_rul,
        health_index=round(health_idx, 1),
        urgency_status=urgency,
        primary_fault_diagnosis=diag,
        feature_store_latency_ms=round(fs_latency, 2),
        inference_latency_ms=round(inf_latency, 2),
        total_latency_ms=round(total_latency, 2)
    )


@router.post("/v1/triage/crash-event", response_model=CrashTriageResponse)
async def triage_crash_event(req: CrashTriageRequest):
    triage_result = CrashDetector.evaluate_impact_event(
        acc_x=req.acc_x,
        acc_y=req.acc_y,
        acc_z=req.acc_z,
        gyro_x=req.gyro_x,
        gyro_y=req.gyro_y,
        gyro_z=req.gyro_z,
        speed_kmh=req.speed_kmh,
        phone_mount=req.phone_mount or "Handlebar_Mount"
    )
    return CrashTriageResponse(**triage_result)


@router.post("/v1/ubi/calculate-premium", response_model=UBICalculationResponse)
async def calculate_ubi_premium(req: UBICalculationRequest, request: Request):
    base_prem = req.base_annual_premium_inr
    score = req.safety_score
    if score is None:
        feat_df, _ = request.app.state.feature_store.get_driver_online_features([req.driver_id])
        score = float(feat_df.iloc[0].get("Safety_Score", 85.0))

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
    ref_df = request.app.state.lakehouse_telemetry
    if ref_df is None or ref_df.empty:
        raise HTTPException(status_code=503, detail="Lakehouse telemetry baseline not loaded")

    # Compare baseline (first half) against current incoming stream (second half)
    half = len(ref_df) // 2
    baseline = ref_df.iloc[:half]
    current = ref_df.iloc[half:]

    features = ["Acceleration_Z", "Acceleration_Y", "Acceleration_X", "Gyro_Z", "Speed_KMH"]
    report = request.app.state.drift_monitor.analyze_drift(baseline, current, features)

    return DriftAnalysisResponse(
        drift_status=report["drift_status"],
        max_psi=report["max_psi"],
        drifted_features_count=report["drifted_features_count"],
        drifted_features=report["drifted_features"],
        feature_details=report["feature_details"],
        retraining_triggered=(report["max_psi"] >= 0.25)
    )
