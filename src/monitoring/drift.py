import numpy as np
import pandas as pd
from scipy import stats
from typing import Dict, Any, List
import logging

logger = logging.getLogger("src.monitoring.drift")


class TelematicsDriftMonitor:
    """
    Production Telematics Drift & Sensor Degradation Monitor.
    Monitors IMU sensor distributions (Ax, Ay, Az, Gyro, Speed, Violation Rates)
    using Population Stability Index (PSI), Kolmogorov-Smirnov test, and Wasserstein distance.
    Alerts when sensor distributions drift (e.g. road weather shifts or mechanical wear),
    triggering automated cloud retraining pipelines at PSI >= 0.25.
    """

    def __init__(self, alert_threshold: float = 0.15, critical_threshold: float = 0.25):
        self.alert_threshold = alert_threshold
        self.critical_threshold = critical_threshold

    def calculate_psi(self, expected: np.ndarray, actual: np.ndarray, num_buckets: int = 10) -> float:
        exp = expected[~np.isnan(expected)]
        act = actual[~np.isnan(actual)]
        if len(exp) == 0 or len(act) == 0:
            return 0.0
        quantiles = np.linspace(0, 100, num_buckets + 1)
        bins = np.percentile(exp, quantiles)
        bins[0] -= 1e-5
        bins[-1] += 1e-5
        bins = np.unique(bins)
        if len(bins) < 2:
            return 0.0
        exp_counts, _ = np.histogram(exp, bins=bins)
        act_counts, _ = np.histogram(act, bins=bins)
        exp_pct = np.where(exp_counts == 0, 1e-4, exp_counts / len(exp))
        act_pct = np.where(act_counts == 0, 1e-4, act_counts / len(act))
        return float(np.sum((act_pct - exp_pct) * np.log(act_pct / exp_pct)))

    def analyze_drift(
        self,
        reference_df: pd.DataFrame,
        current_df: pd.DataFrame,
        features: List[str],
    ) -> Dict[str, Any]:
        results = {}
        max_psi = 0.0
        drifted = []
        for feat in features:
            if feat in reference_df.columns and feat in current_df.columns:
                ref_v = pd.to_numeric(reference_df[feat], errors="coerce").dropna().values.astype(float)
                cur_v = pd.to_numeric(current_df[feat], errors="coerce").dropna().values.astype(float)
                if len(ref_v) < 5 or len(cur_v) < 5:
                    continue
                psi = self.calculate_psi(ref_v, cur_v)
                ks_stat, ks_pval = stats.ks_2samp(ref_v, cur_v)
                wass = float(stats.wasserstein_distance(ref_v, cur_v))
                if psi >= self.alert_threshold:
                    drifted.append(feat)
                max_psi = max(max_psi, psi)
                results[feat] = {
                    "psi": round(psi, 4),
                    "ks_statistic": round(float(ks_stat), 4),
                    "ks_pvalue": round(float(ks_pval), 4),
                    "wasserstein_distance": round(wass, 4),
                    "is_drifted": psi >= self.alert_threshold,
                }
        if max_psi >= self.critical_threshold:
            status = "CRITICAL_DRIFT_RETRAIN_TRIGGERED"
        elif max_psi >= self.alert_threshold:
            status = "MODERATE_DRIFT_WARNING"
        else:
            status = "NO_DRIFT"
        return {
            "drift_status": status,
            "max_psi": round(max_psi, 4),
            "drifted_features_count": len(drifted),
            "drifted_features": drifted,
            "feature_details": results,
        }


# Alias for backward compatibility
DemandDriftMonitor = TelematicsDriftMonitor
