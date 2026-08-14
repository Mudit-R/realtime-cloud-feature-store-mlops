import numpy as np
import pandas as pd
from src.monitoring.drift import DemandDriftMonitor


def test_psi_identical_distribution():
    monitor = DemandDriftMonitor()
    arr = np.random.default_rng(0).normal(0, 1, 500)
    psi = monitor.calculate_psi(arr, arr.copy())
    assert psi < 0.05


def test_psi_shifted_distribution():
    monitor = DemandDriftMonitor()
    ref = np.random.default_rng(0).normal(0, 1, 500)
    shifted = np.random.default_rng(1).normal(2, 1, 500)
    psi = monitor.calculate_psi(ref, shifted)
    assert psi > 0.15


def test_drift_analysis_report():
    rng = np.random.default_rng(42)
    ref = pd.DataFrame({"views_1h": rng.normal(10, 2, 300), "conversion_rate_6h": rng.beta(2, 8, 300)})
    cur = pd.DataFrame({"views_1h": rng.normal(18, 3, 300), "conversion_rate_6h": rng.beta(2, 8, 300)})
    monitor = DemandDriftMonitor()
    report = monitor.analyze_drift(ref, cur, ["views_1h", "conversion_rate_6h"])
    assert "drift_status" in report
    assert "max_psi" in report
    assert report["drift_status"] in ["NO_DRIFT", "MODERATE_DRIFT_WARNING", "CRITICAL_DRIFT_RETRAIN_TRIGGERED"]
