import pytest


def test_health_endpoint(api_client):
    resp = api_client.get("/health")
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "healthy"
    assert "PulseStar" in data["project_name"]
    assert data["driver_model_loaded"] is True
    assert data["vehicle_model_loaded"] is True


def test_fleet_summary_endpoint(api_client):
    resp = api_client.get("/api/fleet/summary")
    assert resp.status_code == 200
    data = resp.json()
    assert data["Total_Drivers"] == 30
    assert data["Total_Vehicles"] == 30
    assert data["Total_Trips"] == 450


def test_driver_risk_prediction_endpoint(api_client):
    payload = {
        "driver_id": "D01",
        "harsh_brake_rate": 4.5,
        "overspeed_50_pct": 12.0
    }
    resp = api_client.post("/v1/predict/driver-risk", json=payload)
    assert resp.status_code == 200
    data = resp.json()
    assert "predicted_safety_score" in data
    assert 15.0 <= data["predicted_safety_score"] <= 99.0
    assert "accident_probability_pct" in data
    assert "ubi_premium_discount_pct" in data
    assert data["total_latency_ms"] >= 0


def test_vehicle_rul_prediction_endpoint(api_client):
    payload = {
        "vehicle_id": "V02",
        "vibration_rms": 0.72,
        "gyro_jitter": 19.5
    }
    resp = api_client.post("/v1/predict/vehicle-rul", json=payload)
    assert resp.status_code == 200
    data = resp.json()
    assert "predicted_rul_days" in data
    assert data["predicted_rul_days"] > 0
    assert "urgency_status" in data


def test_crash_triage_endpoint(api_client):
    payload = {
        "acc_x": 3.8,
        "acc_y": -6.5,
        "acc_z": 18.5,
        "gyro_x": 20.0,
        "gyro_y": 45.0,
        "gyro_z": 70.0,
        "speed_kmh": 45.0
    }
    resp = api_client.post("/v1/triage/crash-event", json=payload)
    assert resp.status_code == 200
    data = resp.json()
    assert data["event_type"] == "CRITICAL_COLLISION"
    assert data["emergency_dispatch_required"] is True


def test_ubi_premium_endpoint(api_client):
    payload = {
        "driver_id": "D01",
        "base_annual_premium_inr": 10000.0,
        "safety_score": 90.0
    }
    resp = api_client.post("/v1/ubi/calculate-premium", json=payload)
    assert resp.status_code == 200
    data = resp.json()
    assert data["discount_or_surcharge_pct"] == 25.0
    assert data["adjusted_premium_inr"] == 7500.0
