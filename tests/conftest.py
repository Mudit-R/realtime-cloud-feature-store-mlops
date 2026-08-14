import pytest
import pandas as pd
import numpy as np
from fastapi.testclient import TestClient
from src.data.telematics_generator import generate_telematics_dataset
from src.features.signal_processing import compute_telematics_metrics
from src.features.store import FeatureStoreManager
from src.features.transformers import DriverFeaturePreprocessor, VehicleFeaturePreprocessor
from src.models.driver_risk_model import DriverRiskModelTrainer
from src.models.vehicle_rul_model import VehicleRULModelTrainer
from src.api.app import app


@pytest.fixture(scope="session")
def raw_telematics_data():
    return generate_telematics_dataset(output_dir="data/raw", lake_dir="data/lakehouse", seed=99)


@pytest.fixture(scope="session")
def processed_telematics_data(raw_telematics_data):
    df_drivers, df_vehicles, df_trips, df_telemetry = raw_telematics_data
    return compute_telematics_metrics(df_drivers, df_vehicles, df_trips, df_telemetry, output_fixtures_dir="data/processed")


@pytest.fixture(scope="session")
def trained_models(processed_telematics_data):
    df_d_proc, df_v_proc, _, _, _ = processed_telematics_data

    d_trainer = DriverRiskModelTrainer(n_trials=3)
    d_model, _ = d_trainer.train_with_optuna(df_d_proc)

    v_trainer = VehicleRULModelTrainer(n_trials=3)
    v_model, _ = v_trainer.train_with_optuna(df_v_proc)

    return d_model, v_model


@pytest.fixture(scope="session")
def api_client(processed_telematics_data, trained_models, raw_telematics_data):
    df_d_proc, df_v_proc, fleet_summary, potholes, trip_samples = processed_telematics_data
    d_model, v_model = trained_models
    _, _, _, df_telemetry = raw_telematics_data

    with TestClient(app) as client:
        app.state.driver_model = d_model
        app.state.vehicle_model = v_model
        app.state.fixtures = {
            "fleet_summary": fleet_summary,
            "processed_drivers": df_d_proc.to_dict(orient="records"),
            "processed_vehicles": df_v_proc.to_dict(orient="records"),
            "pothole_gis_sample": potholes,
            "trips_telemetry_sample": trip_samples
        }
        app.state.lakehouse_telemetry = df_telemetry
        app.state.feature_store.load_in_memory_cache(df_d_proc, df_v_proc, df_telemetry)
        yield client
