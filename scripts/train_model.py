#!/usr/bin/env python
import os
import sys
import argparse
import logging
import pandas as pd

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
from src.models.trainer import PricingModelTrainer
from src.models.evaluator import ModelEvaluator

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("train_model")

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--tune", action="store_true")
    parser.add_argument("--tune-trials", type=int, default=10)
    args = parser.parse_args()

    df = pd.read_parquet("data/lake/training_dataset.parquet")
    logger.info(f"Loaded training dataset: {len(df)} rows")

    trainer = PricingModelTrainer()
    train_df, val_df, test_df = trainer.time_split(df)
    logger.info(f"Splits: train={len(train_df)}, val={len(val_df)}, test={len(test_df)}")

    params = None
    if args.tune:
        logger.info(f"Running Optuna HPO ({args.tune_trials} trials)...")
        params = trainer.optimize_hyperparams(train_df, val_df, n_trials=args.tune_trials)
        logger.info(f"Best params: {params}")

    logger.info("Training final model...")
    trainer.train(train_df, val_df, params=params)

    evaluator = ModelEvaluator(trainer.model, trainer.preprocessor)
    metrics = evaluator.evaluate(test_df)
    evaluator.save_metrics(metrics)
    logger.info(f"Test metrics: {metrics}")
    trainer.save()
