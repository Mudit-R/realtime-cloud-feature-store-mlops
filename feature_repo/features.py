from datetime import timedelta
from feast import BatchFeatureView, Field, FileSource, types
from feature_repo.entities import driver_entity, vehicle_entity, trip_entity

# 1. Driver Safety Feature View
driver_safety_source = FileSource(
    name="driver_safety_source",
    path="data/lakehouse/processed_drivers.parquet",
    timestamp_field="event_timestamp",
    created_timestamp_column="created_timestamp",
)

driver_safety_feature_view = BatchFeatureView(
    name="driver_safety_features",
    entities=[driver_entity],
    ttl=timedelta(days=30),
    schema=[
        Field(name="harsh_brake_rate",          dtype=types.Float32),
        Field(name="rapid_accel_rate",          dtype=types.Float32),
        Field(name="harsh_turn_rate",           dtype=types.Float32),
        Field(name="overspeed_50_pct",          dtype=types.Float32),
        Field(name="overspeed_65_pct",          dtype=types.Float32),
        Field(name="night_trip_pct",            dtype=types.Float32),
        Field(name="speed_compliance_score",    dtype=types.Float32),
        Field(name="safety_score",              dtype=types.Float32),
        Field(name="experience_years",          dtype=types.Int64),
        Field(name="rating",                    dtype=types.Float32),
    ],
    online=True,
    source=driver_safety_source,
)

# 2. Vehicle Health Feature View
vehicle_health_source = FileSource(
    name="vehicle_health_source",
    path="data/lakehouse/processed_vehicles.parquet",
    timestamp_field="event_timestamp",
    created_timestamp_column="created_timestamp",
)

vehicle_health_feature_view = BatchFeatureView(
    name="vehicle_health_features",
    entities=[vehicle_entity],
    ttl=timedelta(days=30),
    schema=[
        Field(name="vibration_rms",             dtype=types.Float32),
        Field(name="vibration_p95",             dtype=types.Float32),
        Field(name="gyro_jitter",               dtype=types.Float32),
        Field(name="brake_judder",              dtype=types.Float32),
        Field(name="odometer_km",               dtype=types.Int64),
        Field(name="days_since_service",        dtype=types.Int64),
        Field(name="health_index",              dtype=types.Float32),
        Field(name="rul_days",                  dtype=types.Int64),
    ],
    online=True,
    source=vehicle_health_source,
)

# 3. Telemetry Stream Feature View
telemetry_stream_source = FileSource(
    name="telemetry_stream_source",
    path="data/lakehouse/telemetry.parquet",
    timestamp_field="event_timestamp",
    created_timestamp_column="created_timestamp",
)

telemetry_stream_feature_view = BatchFeatureView(
    name="telemetry_stream_features",
    entities=[trip_entity],
    ttl=timedelta(hours=24),
    schema=[
        Field(name="speed_kmh",                 dtype=types.Float32),
        Field(name="acceleration_x",            dtype=types.Float32),
        Field(name="acceleration_y",            dtype=types.Float32),
        Field(name="acceleration_z",            dtype=types.Float32),
        Field(name="gyro_x",                    dtype=types.Float32),
        Field(name="gyro_y",                    dtype=types.Float32),
        Field(name="gyro_z",                    dtype=types.Float32),
    ],
    online=True,
    source=telemetry_stream_source,
)
