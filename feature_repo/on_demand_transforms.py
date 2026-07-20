import pandas as pd
import numpy as np


def compute_pricing_features(df: pd.DataFrame) -> pd.DataFrame:
    """
    Request-time on-demand features computed from raw inputs + stored features.
    These cannot be pre-materialized — they depend on the live request price.
    """
    df = df.copy()

    base = df.get("base_price", pd.Series(dtype=float)).fillna(100.0).astype(float)
    actual = df.get("actual_price", base).fillna(base).astype(float)
    comp_mean = df.get("competitor_mean_price", base).fillna(base).astype(float)
    cost = df.get("cost", base * 0.5).fillna(base * 0.5).astype(float)
    stock = df.get("stock_quantity", pd.Series(50, index=df.index)).fillna(50).astype(float)
    views_1h = df.get("views_1h", pd.Series(0, index=df.index)).fillna(0).astype(float)
    views_24h = df.get("views_24h", pd.Series(1, index=df.index)).fillna(1).astype(float).clip(lower=1)
    purchases_1h = df.get("purchases_1h", pd.Series(0, index=df.index)).fillna(0).astype(float)
    purchases_24h = df.get("purchases_24h", pd.Series(1, index=df.index)).fillna(1).astype(float).clip(lower=1)

    df["price_vs_competitor_ratio"]   = (actual / comp_mean.clip(lower=0.01)).round(4)
    df["price_vs_base_ratio"]         = (actual / base.clip(lower=0.01)).round(4)
    df["gross_margin_pct"]            = ((actual - cost) / actual.clip(lower=0.01)).round(4)
    df["stock_scarcity_score"]        = (1.0 / (stock + 1.0)).round(6)
    df["demand_velocity_ratio"]       = (views_1h / views_24h).round(4)
    df["purchase_acceleration"]       = (purchases_1h / purchases_24h).round(4)
    df["competitor_price_undercut"]   = ((comp_mean - actual) / comp_mean.clip(lower=0.01)).round(4)

    return df
