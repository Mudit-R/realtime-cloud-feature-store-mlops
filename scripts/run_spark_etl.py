#!/usr/bin/env python
import os
import sys
import logging
import pandas as pd

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
from src.data.spark_pipeline import DemandFeatureEngine

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("run_spark_etl")

if __name__ == "__main__":
    os.makedirs("data/lake", exist_ok=True)
    logger.info("Loading demand events from lake...")
    events = pd.read_parquet("data/raw/demand_events.parquet")
    products = pd.read_parquet("data/raw/products.parquet")
    comp = pd.read_parquet("data/raw/competitor_prices.parquet")

    engine = DemandFeatureEngine()
    logger.info("Computing product demand aggregates (10m/1h/6h/24h rolling windows)...")
    sample = events.groupby("product_id").head(200).reset_index(drop=True)
    aggs = engine.compute_product_aggregates(sample)
    aggs.to_parquet("data/lake/product_demand_features.parquet", index=False)
    logger.info(f"Saved {len(aggs)} demand aggregate records to data/lake/")

    logger.info("Building AS-OF joined training dataset...")
    training_df = engine.build_training_dataset(sample, aggs, products, comp)
    training_df.to_parquet("data/lake/training_dataset.parquet", index=False)
    logger.info(f"Training dataset: {len(training_df)} rows x {training_df.shape[1]} cols")
