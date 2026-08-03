import json
import os
import numpy as np
import pandas as pd
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score
import logging

logger = logging.getLogger("src.models.evaluator")
TARGET_COL = "optimal_price_multiplier"


class ModelEvaluator:
    def __init__(self, model, preprocessor):
        self.model = model
        self.preprocessor = preprocessor

    def evaluate(self, test_df: pd.DataFrame) -> dict:
        X = self.preprocessor.transform(test_df)
        y = test_df[TARGET_COL].values.astype(float)
        preds = self.model.predict(X)
        mae  = float(mean_absolute_error(y, preds))
        rmse = float(np.sqrt(mean_squared_error(y, preds)))
        r2   = float(r2_score(y, preds))
        # Revenue lift: how well we track optimal pricing
        base_mae  = float(mean_absolute_error(y, np.ones_like(y)))
        lift_pct  = float((base_mae - mae) / base_mae * 100)
        within_5pct = float(np.mean(np.abs(preds - y) <= 0.05) * 100)
        metrics = {
            "mae": round(mae, 6),
            "rmse": round(rmse, 6),
            "r2_score": round(r2, 6),
            "baseline_mae": round(base_mae, 6),
            "revenue_lift_pct": round(lift_pct, 2),
            "pct_within_5pct_of_optimal": round(within_5pct, 2),
        }
        logger.info(f"Evaluation: {metrics}")
        return metrics

    def save_metrics(self, metrics: dict, path: str = "results/evaluation_metrics.json"):
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, "w") as f:
            json.dump(metrics, f, indent=2)
        logger.info(f"Saved metrics to {path}")
