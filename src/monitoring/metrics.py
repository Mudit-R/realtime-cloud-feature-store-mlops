from prometheus_client import Counter, Histogram, Gauge

REQUEST_COUNT = Counter(
    "fraud_api_requests_total",
    "Total number of prediction requests processed",
    ["endpoint", "status"]
)

LATENCY_HISTOGRAM = Histogram(
    "fraud_api_latency_seconds",
    "Latency of prediction endpoints in seconds",
    ["endpoint"],
    buckets=[0.001, 0.005, 0.010, 0.025, 0.050, 0.100, 0.250, 0.500]
)

FEATURE_STORE_LATENCY = Histogram(
    "feast_feature_store_latency_seconds",
    "Latency of online feature store retrieval",
    buckets=[0.0005, 0.001, 0.002, 0.005, 0.010, 0.025]
)

PREDICTION_SCORE_HISTOGRAM = Histogram(
    "fraud_prediction_scores",
    "Distribution of predicted fraud probabilities",
    buckets=[0.0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0]
)

DRIFT_PSI_GAUGE = Gauge(
    "fraud_feature_drift_psi",
    "Population Stability Index (PSI) per feature",
    ["feature_name"]
)
