import os
import joblib
import optuna
import numpy as np
import pandas as pd
import lightgbm as lgb
from sklearn.model_selection import KFold
from sklearn.metrics import mean_absolute_error, r2_score
import logging

logger = logging.getLogger("src.models.vehicle_rul_model")
optuna.logging.set_verbosity(optuna.logging.WARNING)

VEHICLE_FEATURE_COLS = [
    "Vibration_RMS",
    "Vibration_P95",
    "Gyro_Jitter",
    "Brake_Judder",
    "Odometer_KM",
    "Days_Since_Last_Service",
    "Manufacturing_Year"
]


class VehicleRULModelTrainer:
    def __init__(self, n_trials: int = 15):
        self.n_trials = n_trials
        self.model = None
        self.best_params = None

    def train_with_optuna(self, df_vehicles_processed: pd.DataFrame, target_col: str = "Remaining_Useful_Life_Days"):
        X = df_vehicles_processed[VEHICLE_FEATURE_COLS].copy()
        y = df_vehicles_processed[target_col].copy()

        def objective(trial):
            params = {
                "objective": "regression",
                "metric": "mae",
                "boosting_type": "gbdt",
                "n_estimators": trial.suggest_int("n_estimators", 30, 120),
                "learning_rate": trial.suggest_float("learning_rate", 0.02, 0.2, log=True),
                "num_leaves": trial.suggest_int("num_leaves", 7, 31),
                "max_depth": trial.suggest_int("max_depth", 3, 6),
                "subsample": trial.suggest_float("subsample", 0.6, 1.0),
                "verbose": -1,
                "random_state": 42
            }
            
            kf = KFold(n_splits=3, shuffle=True, random_state=42)
            maes = []
            for train_idx, val_idx in kf.split(X):
                X_tr, y_tr = X.iloc[train_idx], y.iloc[train_idx]
                X_va, y_val = X.iloc[val_idx], y.iloc[val_idx]
                
                model = lgb.LGBMRegressor(**params)
                model.fit(X_tr, y_tr)
                preds = model.predict(X_va)
                maes.append(mean_absolute_error(y_val, preds))
                
            return np.mean(maes)

        study = optuna.create_study(direction="minimize")
        study.optimize(objective, n_trials=self.n_trials)
        self.best_params = study.best_params
        self.best_params.update({"objective": "regression", "metric": "mae", "verbose": -1, "random_state": 42})
        
        self.model = lgb.LGBMRegressor(**self.best_params)
        self.model.fit(X, y)
        
        preds = self.model.predict(X)
        mae = mean_absolute_error(y, preds)
        r2 = r2_score(y, preds)
        logger.info(f"Vehicle RUL LightGBM Model Trained: MAE={mae:.2f} days, R2={r2:.3f}")
        return self.model, {"mae_days": float(mae), "r2": float(r2)}

    def save(self, model_path: str = "models/vehicle_rul_model.joblib"):
        os.makedirs(os.path.dirname(model_path), exist_ok=True)
        joblib.dump(self.model, model_path)
        logger.info(f"Saved vehicle RUL model to {model_path}")
