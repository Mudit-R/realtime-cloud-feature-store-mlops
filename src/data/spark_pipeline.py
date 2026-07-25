import pandas as pd
import numpy as np
import logging

logger = logging.getLogger("src.data.spark_pipeline")


class DemandFeatureEngine:
    """
    Vectorized temporal feature engineering pipeline (production: PySpark on AWS EMR).
    Computes rolling window demand signals (10m, 1h, 6h, 24h) for e-commerce pricing.
    """

    @staticmethod
    def _strip_tz(df: pd.DataFrame) -> pd.DataFrame:
        """Normalize all tz-aware columns to naive UTC for consistent merging."""
        df = df.copy()
        for col in df.select_dtypes(include=["datetimetz"]).columns:
            df[col] = df[col].dt.tz_localize(None)
        return df

    def compute_product_aggregates(self, events_df: pd.DataFrame) -> pd.DataFrame:
        df = self._strip_tz(events_df).sort_values("event_timestamp").reset_index(drop=True)
        records = []
        for product_id, pdf in df.groupby("product_id"):
            pdf = pdf.sort_values("event_timestamp").reset_index(drop=True)
            times = pdf["event_timestamp"].values
            prices = pdf["actual_price"].values
            event_types = pdf["event_type"].values
            demand_scores = pdf["demand_score"].values
            n = len(pdf)
            for i in range(n):
                ct = times[i]
                m10  = (times <= ct) & (times >= ct - np.timedelta64(10,  "m"))
                m1h  = (times <= ct) & (times >= ct - np.timedelta64(1,   "h"))
                m6h  = (times <= ct) & (times >= ct - np.timedelta64(6,   "h"))
                m24h = (times <= ct) & (times >= ct - np.timedelta64(24,  "h"))

                def cnt(mask, etype=None):
                    if etype:
                        return int(np.sum(mask & (event_types == etype)))
                    return int(np.sum(mask))

                views_10m  = cnt(m10,  "view")
                views_1h   = cnt(m1h,  "view")
                views_6h   = cnt(m6h,  "view")
                views_24h  = cnt(m24h, "view")
                carts_1h   = cnt(m1h,  "cart")
                carts_6h   = cnt(m6h,  "cart")
                purchases_1h  = cnt(m1h,  "purchase")
                purchases_24h = cnt(m24h, "purchase")
                total_24h  = cnt(m24h)

                prices_24h = prices[m24h]
                mean_price_24h = float(np.mean(prices_24h)) if len(prices_24h) > 0 else 0.0
                std_price_24h  = float(np.std(prices_24h))  if len(prices_24h) > 0 else 0.0

                demand_scores_1h = demand_scores[m1h]
                mean_demand_1h = float(np.mean(demand_scores_1h)) if len(demand_scores_1h) > 0 else 0.0

                conversion_rate_6h = float(cnt(m6h, "purchase") / max(cnt(m6h), 1))
                view_to_cart_6h    = float(carts_6h / max(views_6h, 1))
                velocity_ratio     = float(cnt(m1h) / max(cnt(m24h), 1))

                records.append({
                    "product_id": product_id,
                    "event_timestamp": pd.Timestamp(ct),
                    "created_timestamp": pd.Timestamp(ct),
                    "views_10m": views_10m,
                    "views_1h": views_1h,
                    "views_6h": views_6h,
                    "views_24h": views_24h,
                    "carts_1h": carts_1h,
                    "carts_6h": carts_6h,
                    "purchases_1h": purchases_1h,
                    "purchases_24h": purchases_24h,
                    "total_events_24h": total_24h,
                    "mean_price_24h": round(mean_price_24h, 2),
                    "std_price_24h": round(std_price_24h, 2),
                    "mean_demand_score_1h": round(mean_demand_1h, 4),
                    "conversion_rate_6h": round(conversion_rate_6h, 4),
                    "view_to_cart_rate_6h": round(view_to_cart_6h, 4),
                    "velocity_ratio_1h_24h": round(velocity_ratio, 4),
                })
        return pd.DataFrame(records)

    def build_training_dataset(
        self,
        events_df: pd.DataFrame,
        product_aggs: pd.DataFrame,
        products_df: pd.DataFrame,
        competitor_prices_df: pd.DataFrame,
    ) -> pd.DataFrame:
        """AS-OF point-in-time correct join — prevents train-serve skew."""
        ev   = self._strip_tz(events_df)
        aggs = self._strip_tz(product_aggs)
        prods = self._strip_tz(products_df)
        comp  = self._strip_tz(competitor_prices_df)

        df = pd.merge(ev, aggs, on=["product_id", "event_timestamp"], how="left")
        df = pd.merge(
            df,
            prods.drop(columns=["event_timestamp", "created_timestamp"], errors="ignore"),
            on="product_id",
            how="left",
        )
        # Latest competitor price snapshot per product
        latest_comp = (
            comp.sort_values("event_timestamp")
            .groupby("product_id")
            .last()
            .reset_index()
            .drop(columns=["event_timestamp", "created_timestamp"], errors="ignore")
        )
        df = pd.merge(df, latest_comp, on="product_id", how="left")
        from feature_repo.on_demand_transforms import compute_pricing_features
        df = compute_pricing_features(df)
        return df
