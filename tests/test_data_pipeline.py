import pandas as pd
import pytest


def test_telematics_datasets_generation(raw_telematics_data):
    df_drivers, df_vehicles, df_trips, df_telemetry = raw_telematics_data
    
    assert len(df_drivers) == 30
    assert "Driver_ID" in df_drivers.columns
    assert "Archetype" in df_drivers.columns

    assert len(df_vehicles) == 30
    assert "Vehicle_ID" in df_vehicles.columns
    assert "Wear_Condition" in df_vehicles.columns

    assert len(df_trips) == 450
    assert "Distance_KM" in df_trips.columns

    assert len(df_telemetry) > 10000
    required_telemetry = ["Acceleration_X", "Acceleration_Y", "Acceleration_Z", "Gyro_X", "Gyro_Y", "Gyro_Z", "Speed_KMH"]
    for col in required_telemetry:
        assert col in df_telemetry.columns


def test_signal_processing_metrics(processed_telematics_data):
    df_d_proc, df_v_proc, fleet_summary, potholes, trip_samples = processed_telematics_data

    assert len(df_d_proc) == 30
    assert "Safety_Score" in df_d_proc.columns
    assert "Harsh_Brake_Rate_Per_100KM" in df_d_proc.columns

    assert len(df_v_proc) == 30
    assert "Vibration_RMS" in df_v_proc.columns
    assert "Remaining_Useful_Life_Days" in df_v_proc.columns

    assert fleet_summary["Total_Drivers"] == 30
    assert len(potholes) > 0
    assert len(trip_samples) > 0
