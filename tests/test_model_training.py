import pytest
import numpy as np
from src.models.driver_risk_model import DriverRiskModelTrainer
from src.models.vehicle_rul_model import VehicleRULModelTrainer
from src.models.explainer import TelematicsExplainer
from src.models.crash_detector import CrashDetector


def test_driver_risk_model_training(processed_telematics_data):
    df_d_proc, _, _, _, _ = processed_telematics_data
    trainer = DriverRiskModelTrainer(n_trials=3)
    model, metrics = trainer.train_with_optuna(df_d_proc)
    assert model is not None
    assert "mae" in metrics
    assert "r2" in metrics


def test_vehicle_rul_model_training(processed_telematics_data):
    _, df_v_proc, _, _, _ = processed_telematics_data
    trainer = VehicleRULModelTrainer(n_trials=3)
    model, metrics = trainer.train_with_optuna(df_v_proc)
    assert model is not None
    assert "mae_days" in metrics


def test_telematics_explainer(processed_telematics_data):
    df_d_proc, _, _, _, _ = processed_telematics_data
    explainer = TelematicsExplainer()
    sample_driver = df_d_proc.iloc[0].to_dict()
    explanation = explainer.explain_driver_score(sample_driver)
    assert "final_predicted_score" in explanation
    assert "feature_attributions" in explanation
    assert len(explanation["feature_attributions"]) == 5


def test_crash_detector_classes():
    # Critical collision
    res1 = CrashDetector.evaluate_impact_event(3.5, -6.8, 18.2, 25.0, 45.0, 75.0, 44.0)
    assert res1["event_type"] == "CRITICAL_COLLISION"
    assert res1["emergency_dispatch_required"] is True

    # Pothole shock
    res2 = CrashDetector.evaluate_impact_event(0.2, -0.5, 14.2, 2.0, 4.0, 5.0, 35.0)
    assert res2["event_type"] == "ROAD_SURFACE_SHOCK"
    assert res2["emergency_dispatch_required"] is False
