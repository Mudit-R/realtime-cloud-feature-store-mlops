import os
import sys
import logging
import joblib
import pandas as pd
import numpy as np

# Add project root to sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from src.data.telematics_generator import generate_telematics_dataset
from src.features.signal_processing import compute_telematics_metrics
from src.features.transformers import DriverFeaturePreprocessor, VehicleFeaturePreprocessor
from src.models.driver_risk_model import DriverRiskModelTrainer
from src.models.vehicle_rul_model import VehicleRULModelTrainer
from src.features.store import FeatureStoreManager

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")
logger = logging.getLogger("scripts.run_pipeline")


def run_full_pipeline():
    logger.info("=== STEP 1: Generating Raw & Lakehouse Telematics Datasets ===")
    df_drivers, df_vehicles, df_trips, df_telemetry = generate_telematics_dataset(
        output_dir="data/raw", lake_dir="data/lakehouse", seed=42
    )

    logger.info("=== STEP 2: Computing Physics-Calibrated Signals & Feature Aggregates ===")
    df_d_proc, df_v_proc, fleet_summary, potholes, trip_samples = compute_telematics_metrics(
        df_drivers, df_vehicles, df_trips, df_telemetry, output_fixtures_dir="data/processed"
    )

    # Save processed lakehouse files
    df_d_proc.to_parquet("data/lakehouse/processed_drivers.parquet", index=False)
    df_v_proc.to_parquet("data/lakehouse/processed_vehicles.parquet", index=False)

    logger.info("=== STEP 3: Training Optuna-Tuned Driver Risk LightGBM Model ===")
    d_prep = DriverFeaturePreprocessor()
    d_prep.fit(df_d_proc)
    os.makedirs("models", exist_ok=True)
    joblib.dump(d_prep, "models/driver_preprocessor.joblib")

    d_trainer = DriverRiskModelTrainer(n_trials=10)
    d_model, d_metrics = d_trainer.train_with_optuna(df_d_proc)
    d_trainer.save("models/driver_risk_model.joblib")

    logger.info("=== STEP 4: Training Optuna-Tuned Vehicle RUL LightGBM Model ===")
    v_prep = VehicleFeaturePreprocessor()
    v_prep.fit(df_v_proc)
    joblib.dump(v_prep, "models/vehicle_preprocessor.joblib")

    v_trainer = VehicleRULModelTrainer(n_trials=10)
    v_model, v_metrics = v_trainer.train_with_optuna(df_v_proc)
    v_trainer.save("models/vehicle_rul_model.joblib")

    logger.info("=== STEP 5: Testing Feast Feature Store Cache Warming ===")
    fs = FeatureStoreManager()
    fs.load_in_memory_cache(df_d_proc, df_v_proc, df_telemetry)
    d_feats, d_latency = fs.get_driver_online_features(["D01", "D04"])
    v_feats, v_latency = fs.get_vehicle_online_features(["V01", "V03"])
    logger.info(f"Feature Store Online Lookup Tested: Driver Latency={d_latency:.2f}ms, Vehicle Latency={v_latency:.2f}ms")

    logger.info("=== PIPELINE EXECUTION COMPLETE ===")
    logger.info(f"Driver Risk Model R2: {d_metrics['r2']:.3f}, MAE: {d_metrics['mae']:.3f}")
    logger.info(f"Vehicle RUL Model R2: {v_metrics['r2']:.3f}, MAE: {v_metrics['mae_days']:.2f} days")


if __name__ == "__main__":
    run_full_pipeline()
