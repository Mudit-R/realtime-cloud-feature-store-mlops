import os
import time
import json
import joblib
import pandas as pd
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from src.api.routes import router
from src.api.middleware import PrometheusMiddleware
from src.features.store import FeatureStoreManager
from src.features.transformers import DriverFeaturePreprocessor, VehicleFeaturePreprocessor
from src.monitoring.drift import TelematicsDriftMonitor
import logging

logger = logging.getLogger("src.api.app")


@asynccontextmanager
async def lifespan(app: FastAPI):
    app.state.start_time = time.time()
    app.state.feature_store = FeatureStoreManager(
        use_redis=(os.environ.get("USE_REDIS", "false").lower() == "true")
    )
    app.state.driver_preprocessor = DriverFeaturePreprocessor()
    app.state.vehicle_preprocessor = VehicleFeaturePreprocessor()
    app.state.driver_model = None
    app.state.vehicle_model = None
    app.state.drift_monitor = TelematicsDriftMonitor()
    app.state.fixtures = {}
    app.state.lakehouse_telemetry = None

    # 1. Load ML Models
    driver_m_path = "models/driver_risk_model.joblib"
    vehicle_m_path = "models/vehicle_rul_model.joblib"
    driver_p_path = "models/driver_preprocessor.joblib"
    vehicle_p_path = "models/vehicle_preprocessor.joblib"

    if os.path.exists(driver_m_path):
        app.state.driver_model = joblib.load(driver_m_path)
        logger.info("Loaded Driver Risk LightGBM Model.")
    if os.path.exists(vehicle_m_path):
        app.state.vehicle_model = joblib.load(vehicle_m_path)
        logger.info("Loaded Vehicle RUL LightGBM Model.")
    if os.path.exists(driver_p_path):
        app.state.driver_preprocessor = joblib.load(driver_p_path)
    if os.path.exists(vehicle_p_path):
        app.state.vehicle_preprocessor = joblib.load(vehicle_p_path)

    # 2. Load JSON Fixtures for Web Dashboard
    fixtures_dir = "data/processed"
    fixture_files = [
        ("fleet_summary", "fleet_summary.json"),
        ("processed_drivers", "processed_drivers.json"),
        ("processed_vehicles", "processed_vehicles.json"),
        ("pothole_gis_sample", "pothole_gis_sample.json"),
        ("trips_telemetry_sample", "trips_telemetry_sample.json")
    ]
    for key, fname in fixture_files:
        fpath = os.path.join(fixtures_dir, fname)
        if os.path.exists(fpath):
            try:
                with open(fpath, "r") as f:
                    app.state.fixtures[key] = json.load(f)
            except Exception as e:
                logger.warning(f"Failed to load fixture {fname}: {e}")

    # 3. Pre-warm Feature Store In-Memory Cache
    try:
        d_path = "data/lakehouse/drivers.parquet"
        v_path = "data/lakehouse/vehicles.parquet"
        tel_path = "data/lakehouse/telemetry.parquet"
        if os.path.exists(d_path) and os.path.exists(v_path):
            d_df = pd.read_parquet(d_path)
            v_df = pd.read_parquet(v_path)
            tel_df = pd.read_parquet(tel_path) if os.path.exists(tel_path) else None
            app.state.lakehouse_telemetry = tel_df
            app.state.feature_store.load_in_memory_cache(d_df, v_df, tel_df)
    except Exception as e:
        logger.warning(f"Feature store warm cache skipped: {e}")

    yield


app = FastAPI(
    title="PulseStar - Real-Time Fleet Telematics & Predictive MLOps Platform",
    version="2.0.0",
    description="Cloud-native IoT Telematics, Driver Risk Scoring & Predictive Maintenance on GCP.",
    lifespan=lifespan,
)

app.add_middleware(PrometheusMiddleware)

# Mount static files for Neobrutalist UI
static_dir = os.path.join(os.path.dirname(__file__), "static")
if os.path.exists(static_dir):
    app.mount("/static", StaticFiles(directory=static_dir), name="static")

app.include_router(router)
