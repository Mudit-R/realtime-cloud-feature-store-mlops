import pandas as pd
import numpy as np
from sklearn.preprocessing import StandardScaler
import logging

logger = logging.getLogger("src.features.transformers")

DRIVER_FEATURE_COLUMNS = [
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

VEHICLE_FEATURE_COLUMNS = [
    "Vibration_RMS",
    "Vibration_P95",
    "Gyro_Jitter",
    "Brake_Judder",
    "Odometer_KM",
    "Days_Since_Last_Service",
    "Manufacturing_Year"
]


class DriverFeaturePreprocessor:
    def __init__(self):
        self.scaler = StandardScaler()
        self._fitted = False

    def fit(self, df: pd.DataFrame):
        X = self._extract(df)
        self.scaler.fit(X)
        self._fitted = True
        return self

    def transform(self, df: pd.DataFrame) -> np.ndarray:
        X = self._extract(df)
        if self._fitted:
            return self.scaler.transform(X)
        return X

    def _extract(self, df: pd.DataFrame) -> np.ndarray:
        out = np.zeros((len(df), len(DRIVER_FEATURE_COLUMNS)), dtype=np.float32)
        for j, col in enumerate(DRIVER_FEATURE_COLUMNS):
            if col in df.columns:
                out[:, j] = pd.to_numeric(df[col], errors="coerce").fillna(0).values
        return out


class VehicleFeaturePreprocessor:
    def __init__(self):
        self.scaler = StandardScaler()
        self._fitted = False

    def fit(self, df: pd.DataFrame):
        X = self._extract(df)
        self.scaler.fit(X)
        self._fitted = True
        return self

    def transform(self, df: pd.DataFrame) -> np.ndarray:
        X = self._extract(df)
        if self._fitted:
            return self.scaler.transform(X)
        return X

    def _extract(self, df: pd.DataFrame) -> np.ndarray:
        out = np.zeros((len(df), len(VEHICLE_FEATURE_COLUMNS)), dtype=np.float32)
        for j, col in enumerate(VEHICLE_FEATURE_COLUMNS):
            if col in df.columns:
                out[:, j] = pd.to_numeric(df[col], errors="coerce").fillna(0).values
        return out
