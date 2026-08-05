import numpy as np
import pandas as pd
from typing import Dict, Any, List


class TelematicsExplainer:
    """
    SHAP-like feature importance and attribution breakdown for Driver Safety Scores.
    Explains which driving behaviors contributed to risk score penalties.
    """

    def __init__(self, model=None):
        self.model = model

    def explain_driver_score(self, driver_features: Dict[str, Any]) -> Dict[str, Any]:
        hb = float(driver_features.get("Harsh_Brake_Rate_Per_100KM", 0.0))
        ra = float(driver_features.get("Rapid_Accel_Rate_Per_100KM", 0.0))
        ht = float(driver_features.get("Harsh_Turn_Rate_Per_100KM", 0.0))
        sp_comp = float(driver_features.get("Speed_Compliance_Score", 100.0))
        night_pct = float(driver_features.get("Night_Trip_Pct", 0.0))

        base_score = 100.0
        hb_penalty = round(hb * 2.2, 1)
        ra_penalty = round(ra * 1.8, 1)
        ht_penalty = round(ht * 2.0, 1)
        speed_penalty = round((100.0 - sp_comp) * 0.35, 1)
        night_penalty = round(night_pct * 0.1, 1)

        total_penalty = hb_penalty + ra_penalty + ht_penalty + speed_penalty + night_penalty
        final_score = round(float(np.clip(base_score - total_penalty, 15.0, 99.0)), 1)

        attributions = [
            {"feature": "Harsh Braking Rate (/100km)", "impact_score": -hb_penalty, "unit": f"{hb:.1f} events/100km"},
            {"feature": "Rapid Acceleration Rate (/100km)", "impact_score": -ra_penalty, "unit": f"{ra:.1f} events/100km"},
            {"feature": "Harsh Cornering & Swerving (/100km)", "impact_score": -ht_penalty, "unit": f"{ht:.1f} events/100km"},
            {"feature": "Speed Compliance Non-Adherence", "impact_score": -speed_penalty, "unit": f"{100-sp_comp:.1f}% deviation"},
            {"feature": "High-Risk Night Driving Exposure", "impact_score": -night_penalty, "unit": f"{night_pct:.1f}% night trips"},
        ]

        # Sort by highest impact penalty
        attributions = sorted(attributions, key=lambda x: x["impact_score"])

        return {
            "baseline_score": base_score,
            "final_predicted_score": final_score,
            "top_risk_driver": attributions[0]["feature"],
            "feature_attributions": attributions
        }
