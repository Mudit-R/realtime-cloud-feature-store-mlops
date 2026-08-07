#!/usr/bin/env python
import os
import sys
import json
import logging
import pandas as pd
import numpy as np

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
from src.monitoring.drift import DemandDriftMonitor

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("evaluate_drift")

DRIFT_FEATURES = [
    "views_1h", "views_24h", "carts_1h", "purchases_24h",
    "mean_demand_score_1h", "conversion_rate_6h", "velocity_ratio_1h_24h",
    "price_vs_competitor_ratio", "stock_scarcity_score",
]

if __name__ == "__main__":
    df = pd.read_parquet("data/lake/training_dataset.parquet")
    df = df.dropna(subset=[c for c in DRIFT_FEATURES if c in df.columns])
    reference = df.iloc[:int(len(df) * 0.6)]
    current   = df.iloc[int(len(df) * 0.6):]
    monitor = DemandDriftMonitor()
    feats = [f for f in DRIFT_FEATURES if f in df.columns]
    report = monitor.analyze_drift(reference, current, feats)
    logger.info(f"Drift report: {report['drift_status']}  max_PSI={report['max_psi']}")
    os.makedirs("results", exist_ok=True)
    with open("results/drift_report.json", "w") as f:
        json.dump(report, f, indent=2)
    logger.info("Saved results/drift_report.json")
