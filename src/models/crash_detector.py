import numpy as np
from typing import Dict, Any, List


class CrashDetector:
    """
    Automated e-FNOL (Electronic First Notice of Loss) Crash & Severe Impact Triage Engine.
    Processes millisecond sensor bursts (Ax, Ay, Az, Gx, Gy, Gz, Speed) to classify safety incidents.
    """

    @staticmethod
    def evaluate_impact_event(
        acc_x: float,
        acc_y: float,
        acc_z: float,
        gyro_x: float,
        gyro_y: float,
        gyro_z: float,
        speed_kmh: float,
        phone_mount: str = "Handlebar_Mount"
    ) -> Dict[str, Any]:
        vert_dev_g = abs(acc_z - 9.81) / 9.81
        long_g = abs(acc_y) / 9.81
        lat_g = abs(acc_x) / 9.81
        total_g = np.sqrt(vert_dev_g**2 + long_g**2 + lat_g**2)
        
        yaw_rate = abs(gyro_z)
        roll_rate = abs(gyro_y)

        # 1. Critical Crash Check
        if (long_g >= 0.55 or vert_dev_g >= 0.45) and (speed_kmh >= 25.0) and (yaw_rate >= 50.0 or roll_rate >= 40.0):
            return {
                "event_type": "CRITICAL_COLLISION",
                "severity": "CRITICAL",
                "emergency_dispatch_required": True,
                "confidence_score": 0.94,
                "peak_g_force": round(float(total_g), 2),
                "speed_at_impact_kmh": round(float(speed_kmh), 1),
                "reconstruction_narrative": "High-energy impact detected with severe rotational velocity at speed."
            }

        # 2. Low Speed Tip-Over / Slide
        elif roll_rate >= 35.0 and speed_kmh < 20.0 and vert_dev_g >= 0.25:
            return {
                "event_type": "LOW_SPEED_TIPOVER",
                "severity": "MEDIUM",
                "emergency_dispatch_required": False,
                "confidence_score": 0.88,
                "peak_g_force": round(float(total_g), 2),
                "speed_at_impact_kmh": round(float(speed_kmh), 1),
                "reconstruction_narrative": "Lateral bike tilt/drop detected at low speed (parking or low-traction slide)."
            }

        # 3. Pothole / Road Anomaly Shock
        elif vert_dev_g >= 0.22 and speed_kmh > 15.0 and roll_rate < 25.0 and yaw_rate < 30.0:
            return {
                "event_type": "ROAD_SURFACE_SHOCK",
                "severity": "LOW",
                "emergency_dispatch_required": False,
                "confidence_score": 0.96,
                "peak_g_force": round(float(total_g), 2),
                "speed_at_impact_kmh": round(float(speed_kmh), 1),
                "reconstruction_narrative": "Sharp vertical road surface shock. Tagged for GIS Pothole Registry."
            }

        # 4. Normal Dynamics
        return {
            "event_type": "NOMINAL_OPERATION",
            "severity": "NONE",
            "emergency_dispatch_required": False,
            "confidence_score": 0.99,
            "peak_g_force": round(float(total_g), 2),
            "speed_at_impact_kmh": round(float(speed_kmh), 1),
            "reconstruction_narrative": "Sensor values within normal dynamic operating envelope."
        }
