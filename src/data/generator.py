import argparse
import os
import numpy as np
import pandas as pd
import logging

logger = logging.getLogger("src.data.generator")


def generate_products(n_products: int = 500, seed: int = 42) -> pd.DataFrame:
    rng = np.random.default_rng(seed)
    product_ids = [f"product_{i:05d}" for i in range(n_products)]
    categories = ["electronics", "apparel", "home", "sports", "beauty", "books", "toys"]
    records = []
    for pid in product_ids:
        cat = rng.choice(categories)
        base_price = float(rng.uniform(10.0, 2000.0))
        cost = base_price * float(rng.uniform(0.35, 0.65))
        records.append({
            "product_id": pid,
            "category": str(cat),
            "base_price": round(base_price, 2),
            "cost": round(cost, 2),
            "price_elasticity": round(float(rng.uniform(-2.5, -0.5)), 3),
            "stock_quantity": int(rng.integers(0, 2000)),
            "is_seasonal": int(rng.random() < 0.3),
            "brand_tier": int(rng.choice([1, 2, 3])),
            "event_timestamp": pd.Timestamp("2024-01-01", tz="UTC"),
            "created_timestamp": pd.Timestamp("2024-01-01", tz="UTC"),
        })
    return pd.DataFrame(records)


def generate_competitor_prices(products_df: pd.DataFrame, n_competitors: int = 5, seed: int = 42) -> pd.DataFrame:
    rng = np.random.default_rng(seed)
    records = []
    timestamps = pd.date_range("2024-01-01", periods=90, freq="6h", tz="UTC")
    for _, row in products_df.iterrows():
        for ts in timestamps:
            prices = [round(float(row["base_price"]) * float(rng.uniform(0.80, 1.20)), 2)
                      for _ in range(n_competitors)]
            records.append({
                "product_id": row["product_id"],
                "event_timestamp": ts,
                "created_timestamp": ts,
                "competitor_min_price": min(prices),
                "competitor_max_price": max(prices),
                "competitor_mean_price": round(float(np.mean(prices)), 2),
                "competitor_price_std": round(float(np.std(prices)), 2),
                "n_competitors_cheaper": int(sum(p < float(row["base_price"]) for p in prices)),
            })
    return pd.DataFrame(records)


def generate_demand_events(products_df: pd.DataFrame, n_events: int = 100_000, seed: int = 42) -> pd.DataFrame:
    rng = np.random.default_rng(seed)
    product_ids = products_df["product_id"].values
    product_lookup = products_df.set_index("product_id")
    start = pd.Timestamp("2024-01-01", tz="UTC")
    end = pd.Timestamp("2024-04-01", tz="UTC")
    span_seconds = int((end - start).total_seconds())
    offsets = sorted(rng.integers(0, span_seconds, size=n_events).tolist())
    records = []
    for i, offset in enumerate(offsets):
        ts = start + pd.Timedelta(seconds=int(offset))
        pid = str(product_ids[int(rng.integers(0, len(product_ids)))])
        row = product_lookup.loc[pid]
        base_price = float(row["base_price"])
        elasticity = float(row["price_elasticity"])
        actual_price = base_price * float(rng.uniform(0.85, 1.20))
        price_ratio = actual_price / base_price
        demand_multiplier = float(rng.uniform(2.0, 5.0)) if rng.random() < 0.05 else 1.0
        raw_demand = float(rng.beta(2, 5))
        demand_score = float(np.clip(
            raw_demand * demand_multiplier * (1 + elasticity * (price_ratio - 1)), 0.01, 1.0
        ))
        optimal_multiplier = float(np.clip(1.0 - (1.0 / elasticity) * (demand_score - 0.4), 0.70, 1.40))
        hour = ts.hour
        dow = ts.dayofweek
        records.append({
            "product_id": pid,
            "event_timestamp": ts,
            "created_timestamp": ts,
            "session_id": f"sess_{i:08d}",
            "event_type": str(rng.choice(["view", "cart", "purchase"], p=[0.70, 0.20, 0.10])),
            "actual_price": round(actual_price, 2),
            "base_price": round(base_price, 2),
            "price_ratio": round(price_ratio, 4),
            "demand_score": round(demand_score, 4),
            "optimal_price_multiplier": round(optimal_multiplier, 4),
            "hour_of_day": hour,
            "day_of_week": dow,
            "is_weekend": int(dow >= 5),
            "is_peak_hour": int(6 <= hour <= 22),
            "demand_surge_active": int(demand_multiplier > 1.5),
            "stock_quantity": max(0, int(row["stock_quantity"]) - int(rng.integers(0, 10))),
            "category": str(row["category"]),
        })
    return pd.DataFrame(records)


def main():
    logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
    parser = argparse.ArgumentParser()
    parser.add_argument("--num-events", type=int, default=100_000)
    parser.add_argument("--num-products", type=int, default=500)
    parser.add_argument("--seed", type=int, default=42)
    args = parser.parse_args()
    os.makedirs("data/raw", exist_ok=True)
    os.makedirs("data/lake", exist_ok=True)
    logger.info(f"Generating {args.num_products} products...")
    products = generate_products(args.num_products, args.seed)
    products.to_parquet("data/raw/products.parquet", index=False)
    logger.info("Generating competitor prices...")
    comp = generate_competitor_prices(products, seed=args.seed)
    comp.to_parquet("data/raw/competitor_prices.parquet", index=False)
    logger.info(f"Generating {args.num_events} demand events...")
    events = generate_demand_events(products, args.num_events, args.seed)
    events.to_parquet("data/raw/demand_events.parquet", index=False)
    logger.info("Data generation complete.")


if __name__ == "__main__":
    main()
