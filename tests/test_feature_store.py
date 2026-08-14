import pytest
import pandas as pd
import numpy as np
from src.features.store import FeatureStoreManager
from src.features.transformers import DriverFeaturePreprocessor, VehicleFeaturePreprocessor


def test_feature_store_driver_online_lookup(processed_telematics_data):
    df_d_proc, df_v_proc, _, _, _ = processed_telematics_data
    store = FeatureStoreManager()
    store.load_in_memory_cache(df_d_proc, df_v_proc)

    features_df, latency_ms = store.get_driver_online_features(["D01", "D04"])
    assert len(features_df) == 2
    assert latency_ms < 50.0
    assert "Harsh_Brake_Rate_Per_100KM" in features_df.columns
    assert "Safety_Score" in features_df.columns


def test_feature_store_vehicle_online_lookup(processed_telematics_data):
    df_d_proc, df_v_proc, _, _, _ = processed_telematics_data
    store = FeatureStoreManager()
    store.load_in_memory_cache(df_d_proc, df_v_proc)

    features_df, latency_ms = store.get_vehicle_online_features(["V01", "V03"])
    assert len(features_df) == 2
    assert latency_ms < 50.0
    assert "Vibration_RMS" in features_df.columns
    assert "Remaining_Useful_Life_Days" in features_df.columns


def test_driver_preprocessor(processed_telematics_data):
    df_d_proc, _, _, _, _ = processed_telematics_data
    pre = DriverFeaturePreprocessor()
    pre.fit(df_d_proc)
    X = pre.transform(df_d_proc)
    assert X.shape[0] == len(df_d_proc)
    assert X.shape[1] == 11
    assert not np.isnan(X).any()
