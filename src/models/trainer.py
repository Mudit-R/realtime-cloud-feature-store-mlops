import os
import time
import joblib
import pandas as pd
import numpy as np
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score
import lightgbm as lgb
import optuna
import logging
from src.features.transformers import FeaturePreprocessor, FEATURE_COLUMNS

logger = logging.getLogger("src.models.trainer")
optuna.logging.set_verbosity(optuna.logging.WARNING)

TARGET_COL = "optimal_price_multiplier"


class PricingModelTrainer:
    """
    LightGBM regression trainer for optimal price multiplier prediction.
    Incorporates Optuna Bayesian HPO and temporal train/val/test splits.
    """

    def __init__(self, config: dict = None):
        self.config = config or {}
        self.model = None
        self.preprocessor = FeaturePreprocessor()

    def time_split(self, df: pd.DataFrame, train_ratio=0.70, val_ratio=0.15):
        sorted_df = df.sort_values("event_timestamp").reset_index(drop=True)
        n = len(sorted_df)
        n_train = int(n * train_ratio)
        n_val   = int(n * (train_ratio + val_ratio))
        return sorted_df.iloc[:n_train], sorted_df.iloc[n_train:n_val], sorted_df.iloc[n_val:]

    def train(self, train_df: pd.DataFrame, val_df: pd.DataFrame, params: dict = None) -> lgb.LGBMRegressor:
        self.preprocessor.fit(train_df)
        X_train = self.preprocessor.transform(train_df)
        y_train = train_df[TARGET_COL].values.astype(np.float32)
        X_val   = self.preprocessor.transform(val_df)
        y_val   = val_df[TARGET_COL].values.astype(np.float32)

        default_params = {
            "objective": "regression",
            "metric": "mae",
            "n_estimators": 300,
            "learning_rate": 0.04,
            "num_leaves": 63,
            "max_depth": 7,
            "subsample": 0.8,
            "colsample_bytree": 0.8,
            "min_child_samples": 20,
            "reg_alpha": 0.1,
            "reg_lambda": 0.1,
            "random_state": 42,
            "n_jobs": -1,
            "verbose": -1,
        }
        if params:
            default_params.update(params)

        logger.info(f"Training LightGBM regressor on {len(X_train)} samples, {X_train.shape[1]} features")
        self.model = lgb.LGBMRegressor(**default_params)
        self.model.fit(
            X_train, y_train,
            eval_set=[(X_val, y_val)],
            callbacks=[lgb.early_stopping(30, verbose=False)],
        )
        preds = self.model.predict(X_val)
        mae  = mean_absolute_error(y_val, preds)
        rmse = float(np.sqrt(mean_squared_error(y_val, preds)))
        r2   = r2_score(y_val, preds)
        logger.info(f"Val MAE={mae:.4f}  RMSE={rmse:.4f}  R2={r2:.4f}")
        return self.model

    def optimize_hyperparams(self, train_df: pd.DataFrame, val_df: pd.DataFrame, n_trials: int = 15) -> dict:
        self.preprocessor.fit(train_df)
        X_tr = self.preprocessor.transform(train_df)
        y_tr = train_df[TARGET_COL].values.astype(np.float32)
        X_va = self.preprocessor.transform(val_df)
        y_va = val_df[TARGET_COL].values.astype(np.float32)

        def objective(trial):
            params = {
                "objective": "regression",
                "learning_rate": trial.suggest_float("learning_rate", 0.01, 0.15, log=True),
                "num_leaves": trial.suggest_int("num_leaves", 31, 127),
                "max_depth": trial.suggest_int("max_depth", 4, 10),
                "subsample": trial.suggest_float("subsample", 0.6, 1.0),
                "colsample_bytree": trial.suggest_float("colsample_bytree", 0.6, 1.0),
                "min_child_samples": trial.suggest_int("min_child_samples", 10, 50),
                "reg_alpha": trial.suggest_float("reg_alpha", 0.0, 0.5),
                "reg_lambda": trial.suggest_float("reg_lambda", 0.0, 0.5),
                "n_estimators": 200,
                "random_state": 42,
                "n_jobs": -1,
                "verbose": -1,
            }
            mod = lgb.LGBMRegressor(**params)
            mod.fit(X_tr, y_tr, eval_set=[(X_va, y_va)], callbacks=[lgb.early_stopping(20, verbose=False)])
            preds = mod.predict(X_va)
            return -mean_absolute_error(y_va, preds)  # maximize negative MAE

        study = optuna.create_study(direction="maximize")
        study.optimize(objective, n_trials=n_trials)
        logger.info(f"Best trial MAE: {-study.best_value:.4f}")
        return study.best_params

    def save(self, model_dir: str = "models"):
        os.makedirs(model_dir, exist_ok=True)
        joblib.dump(self.model, os.path.join(model_dir, "lgbm_pricing_model.joblib"))
        joblib.dump(self.preprocessor, os.path.join(model_dir, "feature_preprocessor.joblib"))
        logger.info(f"Saved model to {model_dir}/")
