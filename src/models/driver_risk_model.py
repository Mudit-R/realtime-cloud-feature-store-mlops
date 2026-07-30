import os
import joblib
import optuna
import numpy as np
import pandas as pd
import lightgbm as lgb
from sklearn.model_selection import KFold
from sklearn.metrics import mean_squared_error, mean_absolute_error, r2_score
import logging

logger = logging.getLogger("src.models.driver_risk_model")
optuna.logging.set_verbosity(optuna.logging.WARNING)

FEATURE_COLS = [
    "Harsh_Brake_Rate_Per_100KM",
    "Rapid_Accel_Rate_Per_100KM",
    "Harsh_Turn_Rate_Per_100KM",
    "Overspeed_50_Pct",
    "Overspeed_65_Pct",
    "Night_Trip_Pct",
    "Speed_Compliance_Score",
    "Experience_Years",
    "Rating",
    "Avg_Speed_KMH",
    "Max_Speed_KMH"
]


class DriverRiskModelTrainer:
    def __init__(self, n_trials: int = 15):
        self.n_trials = n_trials
        self.best_params = None
        self.model = None

    def train_with_optuna(self, df_drivers_processed: pd.DataFrame, target_col: str = "Safety_Score"):
        X = df_drivers_processed[FEATURE_COLS].copy()
        y = df_drivers_processed[target_col].copy()

        def objective(trial):
            params = {
                "objective": "regression",
                "metric": "rmse",
                "boosting_type": "gbdt",
                "n_estimators": trial.suggest_int("n_estimators", 30, 150),
                "learning_rate": trial.suggest_float("learning_rate", 0.02, 0.2, log=True),
                "num_leaves": trial.suggest_int("num_leaves", 7, 31),
                "max_depth": trial.suggest_int("max_depth", 3, 7),
                "min_child_samples": trial.suggest_int("min_child_samples", 2, 10),
                "subsample": trial.suggest_float("subsample", 0.6, 1.0),
                "verbose": -1,
                "random_state": 42
            }
            
            kf = KFold(n_splits=3, shuffle=True, random_state=42)
            rmses = []
            for train_idx, val_idx in kf.split(X):
                X_tr, y_tr = X.iloc[train_idx], y.iloc[train_idx]
                X_va, y_val = X.iloc[val_idx], y.iloc[val_idx]
                
                model = lgb.LGBMRegressor(**params)
                model.fit(X_tr, y_tr)
                preds = model.predict(X_va)
                rmses.append(np.sqrt(mean_squared_error(y_val, preds)))
                
            return np.mean(rmses)

        study = optuna.create_study(direction="minimize")
        study.optimize(objective, n_trials=self.n_trials)
        self.best_params = study.best_params
        self.best_params.update({"objective": "regression", "metric": "rmse", "verbose": -1, "random_state": 42})
        
        self.model = lgb.LGBMRegressor(**self.best_params)
        self.model.fit(X, y)
        
        preds = self.model.predict(X)
        mae = mean_absolute_error(y, preds)
        r2 = r2_score(y, preds)
        logger.info(f"Driver Risk LightGBM Model Trained: MAE={mae:.3f}, R2={r2:.3f}")
        return self.model, {"mae": float(mae), "r2": float(r2)}

    def save(self, model_path: str = "models/driver_risk_model.joblib"):
        os.makedirs(os.path.dirname(model_path), exist_ok=True)
        joblib.dump(self.model, model_path)
        logger.info(f"Saved driver risk model to {model_path}")
