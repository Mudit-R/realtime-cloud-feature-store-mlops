"""
Real-time Kinematics & High-Frequency Telemetry Stream Engine.
Generates synchronized 20Hz IMU, GPS, and CAN-bus telemetry packets for WebSocket streaming.
"""
import time
import math
import random
from typing import Dict, Any, Optional, List


class TelematicsStreamEngine:
    """
    Simulates high-fidelity 20Hz vehicle telemetry with real physics,
    GPS breadcrumbs, G-Force friction coordinates, and dynamic anomaly injection.
    """

    # Realistic delivery route waypoints in Mumbai (Bandra -> BKC -> Airport -> Andheri)
    WAYPOINTS = [
        {"lat": 19.0596, "lon": 72.8295, "name": "Bandra West Terminal"},
        {"lat": 19.0625, "lon": 72.8360, "name": "Linking Road"},
        {"lat": 19.0680, "lon": 72.8450, "name": "Kalanagar Junction"},
        {"lat": 19.0655, "lon": 72.8685, "name": "BKC Central Avenue"},
        {"lat": 19.0720, "lon": 72.8750, "name": "Kurla Flyover"},
        {"lat": 19.0880, "lon": 72.8660, "name": "Western Express Highway"},
        {"lat": 19.0990, "lon": 72.8525, "name": "Domestic Airport Junction"},
        {"lat": 19.1136, "lon": 72.8697, "name": "Andheri East Logistics Hub"},
    ]

    def __init__(self, vehicle_id: str = "V01", driver_id: str = "D01"):
        self.vehicle_id = vehicle_id
        self.driver_id = driver_id
        self.start_time = time.time()
        self.step_index = 0
        
        # Kinematic state
        self.speed_kmh = 32.0
        self.target_speed_kmh = 38.0
        self.rpm = 3200
        self.throttle_pct = 45.0
        self.brake_pressure_bar = 0.0
        self.heading_deg = 45.0
        
        # Position interpolation
        self.current_wp_idx = 0
        self.progress_between_wp = 0.0
        self.current_lat = self.WAYPOINTS[0]["lat"]
        self.current_lon = self.WAYPOINTS[0]["lon"]
        
        # Rolling physics buffer
        self.vib_history: List[float] = []
        
        # Event injection queue
        self.injected_event: Optional[str] = None
        self.event_duration_ticks = 0

    def inject_event(self, event_type: str):
        """Inject a transient kinematic anomaly (pothole, harsh_brake, swerve, crash)."""
        self.injected_event = event_type
        if event_type == "crash":
            self.event_duration_ticks = 15  # 0.75s pulse
        elif event_type == "harsh_brake":
            self.event_duration_ticks = 25  # 1.25s
        elif event_type == "pothole":
            self.event_duration_ticks = 6   # 0.3s shock
        elif event_type == "swerve":
            self.event_duration_ticks = 20  # 1.0s

    def next_frame(self, delta_sec: float = 0.05) -> Dict[str, Any]:
        """Advance simulation by delta_sec (default 0.05s = 20Hz) and return a telemetry frame."""
        self.step_index += 1
        t = time.time() - self.start_time

        # 1. Update Route Position & GPS
        wp_from = self.WAYPOINTS[self.current_wp_idx]
        next_wp_idx = (self.current_wp_idx + 1) % len(self.WAYPOINTS)
        wp_to = self.WAYPOINTS[next_wp_idx]
        
        step_dist_km = (self.speed_kmh / 3600.0) * delta_sec
        total_seg_dist_km = 1.2  # Approx 1.2 km per segment
        self.progress_between_wp += step_dist_km / total_seg_dist_km
        
        if self.progress_between_wp >= 1.0:
            self.progress_between_wp = 0.0
            self.current_wp_idx = next_wp_idx
            wp_from = self.WAYPOINTS[self.current_wp_idx]
            next_wp_idx = (self.current_wp_idx + 1) % len(self.WAYPOINTS)
            wp_to = self.WAYPOINTS[next_wp_idx]

        # Calculate true bearing / heading
        d_lat = wp_to["lat"] - wp_from["lat"]
        d_lon = wp_to["lon"] - wp_from["lon"]
        target_heading = (math.degrees(math.atan2(d_lon, d_lat)) + 360) % 360
        self.heading_deg += (target_heading - self.heading_deg) * 0.15

        self.current_lat = wp_from["lat"] + (wp_to["lat"] - wp_from["lat"]) * self.progress_between_wp
        self.current_lon = wp_from["lon"] + (wp_to["lon"] - wp_from["lon"]) * self.progress_between_wp

        # 2. Physics & Engine Kinematics
        # Base engine vibrations and road micro-textures
        engine_vib = 0.15 * math.sin(2.0 * math.pi * 18.0 * t)
        road_vib = random.gauss(0.0, 0.22)
        
        acc_x = random.gauss(0.0, 0.15)  # Lateral
        acc_y = random.gauss(0.0, 0.18)  # Longitudinal
        acc_z = 9.81 + engine_vib + road_vib  # Vertical (gravity calibrated)
        
        gyro_x = random.gauss(0.0, 1.2)  # Roll rate °/s
        gyro_y = random.gauss(0.0, 1.5)  # Pitch rate °/s
        gyro_z = random.gauss(0.0, 1.8)  # Yaw rate °/s

        anomaly_alert = None
        
        # 3. Handle Injected or Stochastic Events
        if self.injected_event and self.event_duration_ticks > 0:
            self.event_duration_ticks -= 1
            if self.injected_event == "pothole":
                shock_phase = math.sin(self.event_duration_ticks * math.pi / 3.0)
                acc_z = 9.81 + shock_phase * 26.5  # 2.7g vertical shock
                acc_y -= 2.2  # Slight deceleration bump
                gyro_y += 18.0 * shock_phase
                anomaly_alert = "POTHOLE_IMPACT"
            elif self.injected_event == "harsh_brake":
                self.speed_kmh = max(0.0, self.speed_kmh - 2.8)
                self.throttle_pct = 0.0
                self.brake_pressure_bar = 38.0
                acc_y = -4.6  # -4.6 m/s² hard decel
                gyro_y = 12.0  # Nose dive pitch
                acc_z = 9.81 + random.gauss(0.4, 0.8)  # Brake judder
                anomaly_alert = "HARSH_BRAKING"
            elif self.injected_event == "swerve":
                acc_x = 4.2 * math.sin(self.event_duration_ticks * 0.4)
                gyro_z = 32.0 * math.sin(self.event_duration_ticks * 0.4)
                gyro_x = 14.0 * math.sin(self.event_duration_ticks * 0.4)
                anomaly_alert = "HIGH_G_SWERVE"
            elif self.injected_event == "crash":
                self.speed_kmh = 0.0
                acc_y = -18.5  # Violent frontal impact
                acc_z = 24.2   # Severe vertical rebound
                acc_x = 8.5
                gyro_z = 75.0  # Spin-out rotation
                anomaly_alert = "CRITICAL_COLLISION"
            
            if self.event_duration_ticks == 0:
                self.injected_event = None
        else:
            # Normal driving cruising dynamics
            if random.random() < 0.03:
                self.target_speed_kmh = random.uniform(22.0, 52.0)
            
            # Smooth speed transition
            speed_err = self.target_speed_kmh - self.speed_kmh
            self.speed_kmh += speed_err * 0.04
            acc_y += (speed_err * 0.08)
            
            if speed_err > 0:
                self.throttle_pct = min(100.0, 35.0 + speed_err * 3.5)
                self.brake_pressure_bar = 0.0
            else:
                self.throttle_pct = 0.0
                self.brake_pressure_bar = min(30.0, abs(speed_err) * 2.0)
                
            self.rpm = int(1200 + (self.speed_kmh / 65.0) * 4800 + random.randint(-50, 50))

        # 4. Compute Derived Kinematic & Friction Metrics
        g_force_mag = math.sqrt(acc_x**2 + acc_y**2 + (acc_z - 9.81)**2) / 9.81
        friction_radial_g = math.sqrt(acc_x**2 + acc_y**2) / 9.81  # 2D horizontal friction circle
        
        vert_dev = acc_z - 9.81
        self.vib_history.append(vert_dev**2)
        if len(self.vib_history) > 100:
            self.vib_history.pop(0)
        rolling_vib_rms = math.sqrt(sum(self.vib_history) / max(1, len(self.vib_history)))

        # Dynamic Safety Score (instantaneous)
        instant_safety = max(20.0, 100.0 - (abs(acc_y) * 8.0) - (abs(acc_x) * 6.0) - (rolling_vib_rms * 12.0))

        return {
            "timestamp_ms": int(time.time() * 1000),
            "step_index": self.step_index,
            "vehicle_id": self.vehicle_id,
            "driver_id": self.driver_id,
            "gps": {
                "lat": round(self.current_lat, 6),
                "lon": round(self.current_lon, 6),
                "heading_deg": round(self.heading_deg, 1),
                "segment": wp_from["name"] + " → " + wp_to["name"],
            },
            "kinematics": {
                "speed_kmh": round(self.speed_kmh, 1),
                "rpm": self.rpm,
                "throttle_pct": round(self.throttle_pct, 1),
                "brake_pressure_bar": round(self.brake_pressure_bar, 1),
                "instant_safety_score": round(instant_safety, 1),
            },
            "imu": {
                "acc_x": round(acc_x, 3),
                "acc_y": round(acc_y, 3),
                "acc_z": round(acc_z, 3),
                "gyro_x": round(gyro_x, 2),
                "gyro_y": round(gyro_y, 2),
                "gyro_z": round(gyro_z, 2),
                "g_force_magnitude": round(g_force_mag, 2),
                "friction_radial_g": round(friction_radial_g, 2),
                "rolling_vibration_rms": round(rolling_vib_rms, 3),
            },
            "status": {
                "anomaly_alert": anomaly_alert,
                "is_active": True,
            }
        }
