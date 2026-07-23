import json
import os
import numpy as np
import pandas as pd
import logging

logger = logging.getLogger("src.features.signal_processing")


def compute_telematics_metrics(df_drivers, df_vehicles, df_trips, df_telemetry, output_fixtures_dir="data/processed"):
    """
    Executes physics-calibrated telematics signal processing:
    1. Driver Safety Metrics (Normalized per 100 km, Speed Compliance, Night Ratio, Risk Tier)
    2. Vehicle Mechanical Diagnostics (Vertical Vibration RMS, Steering Jitter, Brake Judder, RUL)
    3. Crowdsourced Pothole GIS Anomaly Detection
    4. Serializes processed entity records and web dashboard fixtures.
    """
    os.makedirs(output_fixtures_dir, exist_ok=True)
    merged = df_telemetry.merge(df_trips, on="Trip_ID", how="left")

    # -------------------------------------------------------------
    # 1. Driver Behavior & Safety Scoring
    # -------------------------------------------------------------
    driver_stats = []
    for d_id, group in merged.groupby("Driver_ID"):
        d_meta = df_drivers[df_drivers["Driver_ID"] == d_id].iloc[0]
        
        total_km = df_trips[df_trips["Driver_ID"] == d_id]["Distance_KM"].sum()
        total_km = max(total_km, 1.0)
        
        harsh_brakes = int((group["Acceleration_Y"] <= -3.0).sum())
        rapid_accels = int((group["Acceleration_Y"] >= 2.8).sum())
        harsh_turns = int(((group["Acceleration_X"].abs() >= 3.0) | ((group["Gyro_Z"].abs() >= 40.0) & (group["Speed_KMH"] > 20))).sum())
        
        hb_rate = round(float((harsh_brakes / total_km) * 100), 2)
        ra_rate = round(float((rapid_accels / total_km) * 100), 2)
        ht_rate = round(float((harsh_turns / total_km) * 100), 2)
        
        over_50_pct = round(float((group["Speed_KMH"] > 50).mean() * 100), 1)
        over_65_pct = round(float((group["Speed_KMH"] > 65).mean() * 100), 1)
        
        d_trips = df_trips[df_trips["Driver_ID"] == d_id]
        trip_hours = pd.to_datetime(d_trips["Start_Time"]).dt.hour
        night_trips = int(((trip_hours >= 22) | (trip_hours < 5)).sum())
        night_pct = round(float((night_trips / len(d_trips)) * 100), 1)
        
        speed_compliance = max(0.0, 100.0 - (over_50_pct * 0.8 + over_65_pct * 2.5))
        penalty = (hb_rate * 2.2) + (ra_rate * 1.8) + (ht_rate * 2.0) + ((100.0 - speed_compliance) * 0.35) + (night_pct * 0.1)
        safety_score = round(float(np.clip(100.0 - penalty, 15.0, 99.0)), 1)
        
        if safety_score >= 82:
            tier = "Safe & Exemplary"
            risk_level = "Low"
        elif safety_score >= 65:
            tier = "Moderate Risk"
            risk_level = "Medium"
        else:
            tier = "High Risk / Aggressive"
            risk_level = "High"
            
        coaching = []
        if hb_rate > 8.0:
            coaching.append("High harsh braking rate: Maintain 3-second trailing distance to reduce emergency stops.")
        if ra_rate > 8.0:
            coaching.append("Frequent aggressive acceleration: Practice progressive throttle control to conserve fuel and prevent wheel slippage.")
        if ht_rate > 6.0:
            coaching.append("Aggressive leaning & swerving in traffic: Decelerate prior to corner entry rather than braking mid-lean.")
        if over_50_pct > 25.0:
            coaching.append("Frequent urban overspeeding (>50 km/h): Regulate speed in dense delivery zones.")
        if not coaching:
            coaching.append("Exemplary driving profile: Consistently smooth throttle and braking modulation.")
            
        driver_stats.append({
            "Driver_ID": d_id,
            "Driver_Name": d_meta["Driver_Name"],
            "Age": int(d_meta["Age"]),
            "Experience_Years": int(d_meta["Experience_Years"]),
            "Primary_Zone": d_meta["Primary_Zone"],
            "Shift_Preference": d_meta["Shift_Preference"],
            "Rating": float(d_meta["Rating"]),
            "Archetype": d_meta["Archetype"],
            "Total_Trips": int(len(d_trips)),
            "Total_Distance_KM": round(float(total_km), 1),
            "Avg_Speed_KMH": round(float(group["Speed_KMH"].mean()), 1),
            "Max_Speed_KMH": round(float(group["Speed_KMH"].max()), 1),
            "Harsh_Brake_Count": harsh_brakes,
            "Harsh_Brake_Rate_Per_100KM": hb_rate,
            "Rapid_Accel_Count": rapid_accels,
            "Rapid_Accel_Rate_Per_100KM": ra_rate,
            "Harsh_Turn_Count": harsh_turns,
            "Harsh_Turn_Rate_Per_100KM": ht_rate,
            "Overspeed_50_Pct": over_50_pct,
            "Overspeed_65_Pct": over_65_pct,
            "Night_Trip_Pct": night_pct,
            "Speed_Compliance_Score": round(float(speed_compliance), 1),
            "Safety_Score": safety_score,
            "Risk_Level": risk_level,
            "Tier": tier,
            "Coaching_Feedback": coaching
        })

    # -------------------------------------------------------------
    # 2. Vehicle Health & Predictive Maintenance Diagnostics
    # -------------------------------------------------------------
    vehicle_stats = []
    for v_id, group in merged.groupby("Vehicle_ID"):
        v_meta = df_vehicles[df_vehicles["Vehicle_ID"] == v_id].iloc[0]
        
        total_km = df_trips[df_trips["Vehicle_ID"] == v_id]["Distance_KM"].sum()
        total_km = max(total_km, 1.0)
        
        az_diff = group["Acceleration_Z"] - 9.81
        vib_rms = round(float(np.sqrt(np.mean(az_diff ** 2))), 3)
        vib_p95 = round(float(np.percentile(np.abs(az_diff), 95)), 3)
        
        straight_mask = (group["Speed_KMH"] > 20) & (group["Acceleration_X"].abs() < 1.0)
        if straight_mask.sum() > 20:
            straight_data = group[straight_mask]
            gyro_jitter = round(float(np.std(straight_data["Gyro_X"]) + np.std(straight_data["Gyro_Y"])), 2)
        else:
            gyro_jitter = round(float(np.std(group["Gyro_X"]) + np.std(group["Gyro_Y"])), 2)
            
        brake_mask = group["Acceleration_Y"] < -1.5
        if brake_mask.sum() > 10:
            brake_judder = round(float(np.std(group.loc[brake_mask, "Acceleration_Z"])), 2)
        else:
            brake_judder = round(float(np.std(group["Acceleration_Z"])), 2)
            
        norm_vib = np.clip((vib_rms - 0.5) / 2.5, 0.0, 1.0)
        norm_jitter = np.clip((gyro_jitter - 15.0) / 35.0, 0.0, 1.0)
        norm_brake = np.clip((brake_judder - 0.6) / 2.4, 0.0, 1.0)
        norm_service = np.clip((float(v_meta["Days_Since_Last_Service"]) - 30) / 120.0, 0.0, 1.0)
        norm_odo = np.clip((float(v_meta["Odometer_KM"]) - 10000) / 50000.0, 0.0, 1.0)
        
        wear_penalty = (norm_vib * 40.0) + (norm_jitter * 25.0) + (norm_brake * 20.0) + (norm_service * 10.0) + (norm_odo * 5.0)
        health_index = round(float(np.clip(100.0 - wear_penalty, 18.0, 98.0)), 1)
        
        rul_days = int(np.clip(health_index * 1.8 - (float(v_meta["Days_Since_Last_Service"]) * 0.2), 3, 180))
        
        if health_index >= 80:
            status = "Optimal / Healthy"
            urgency = "Low"
            diagnosis = "All telemetry and vibration parameters within nominal operating bounds."
        elif health_index >= 60:
            status = "Monitor / Scheduled Service Due"
            urgency = "Medium"
            if norm_jitter > 0.4:
                diagnosis = "Mild handlebar wobble & bearing flutter detected during cruising. Check front fork alignment and tire pressure."
            else:
                diagnosis = "Normal progressive mechanical wear. Recommend standard periodic maintenance."
        else:
            status = "Critical Maintenance Required"
            urgency = "Immediate"
            if norm_vib > 0.6:
                diagnosis = "Severe vertical chassis vibration & damping degradation. Blown shock absorber / fork seal leak."
            elif norm_jitter > 0.6:
                diagnosis = "Excessive rotational jitter on straight stretches. Wheel rim distortion or worn steering stem bearings."
            elif norm_brake > 0.5:
                diagnosis = "Pulsing deceleration & brake judder. Warped brake disc rotor or uneven brake pad wear."
            else:
                diagnosis = "Cumulative sensor anomaly and chassis vibration threshold breach."
                
        vehicle_stats.append({
            "Vehicle_ID": v_id,
            "Model": v_meta["Model"],
            "Vehicle_Type": v_meta["Vehicle_Type"],
            "Capacity": v_meta["Capacity_CC_or_kWh"],
            "Manufacturing_Year": int(v_meta["Manufacturing_Year"]),
            "Odometer_KM": int(v_meta["Odometer_KM"]),
            "Days_Since_Last_Service": int(v_meta["Days_Since_Last_Service"]),
            "Baseline_Condition": v_meta["Wear_Condition"],
            "Total_KM_Tracked": round(float(total_km), 1),
            "Vibration_RMS": vib_rms,
            "Vibration_P95": vib_p95,
            "Gyro_Jitter": gyro_jitter,
            "Brake_Judder": brake_judder,
            "Health_Index": health_index,
            "Remaining_Useful_Life_Days": rul_days,
            "Status": status,
            "Urgency": urgency,
            "Diagnostic_Summary": diagnosis
        })

    # -------------------------------------------------------------
    # 3. Crowdsourced Road Roughness & Potholes GIS
    # -------------------------------------------------------------
    potholes = []
    pothole_counter = 1
    for _, row in merged.iterrows():
        az_dev = abs(row["Acceleration_Z"] - 9.81)
        if az_dev >= 2.2 and row["Speed_KMH"] > 15:
            severity = "Severe Impact" if az_dev > 3.8 else "Moderate Bump"
            potholes.append({
                "Pothole_ID": f"PTH_{pothole_counter:04d}",
                "Latitude": float(row["Latitude"]),
                "Longitude": float(row["Longitude"]),
                "Vertical_Impact_G": round(float(az_dev / 9.81), 2),
                "Speed_KMH": float(row["Speed_KMH"]),
                "Severity": severity,
                "Trip_ID": row["Trip_ID"]
            })
            pothole_counter += 1
            if len(potholes) >= 80:
                break

    # -------------------------------------------------------------
    # 4. Fleet Summary KPI Aggregates
    # -------------------------------------------------------------
    df_d_proc = pd.DataFrame(driver_stats)
    df_v_proc = pd.DataFrame(vehicle_stats)
    
    fleet_summary = {
        "Total_Drivers": int(len(df_drivers)),
        "Total_Vehicles": int(len(df_vehicles)),
        "Total_Trips": int(len(df_trips)),
        "Total_Telemetry_Points": int(len(df_telemetry)),
        "Total_Distance_KM": round(float(df_trips["Distance_KM"].sum()), 1),
        "Avg_Driver_Safety_Score": round(float(df_d_proc["Safety_Score"].mean()), 1),
        "Safe_Drivers_Count": int((df_d_proc["Safety_Score"] >= 82).sum()),
        "Moderate_Drivers_Count": int(((df_d_proc["Safety_Score"] >= 65) & (df_d_proc["Safety_Score"] < 82)).sum()),
        "High_Risk_Drivers_Count": int((df_d_proc["Safety_Score"] < 65).sum()),
        "Avg_Vehicle_Health_Index": round(float(df_v_proc["Health_Index"].mean()), 1),
        "Healthy_Vehicles_Count": int((df_v_proc["Health_Index"] >= 80).sum()),
        "Monitor_Vehicles_Count": int(((df_v_proc["Health_Index"] >= 60) & (df_v_proc["Health_Index"] < 80)).sum()),
        "Critical_Vehicles_Count": int((df_v_proc["Health_Index"] < 60).sum()),
        "Total_Detected_Potholes": len(potholes)
    }

    # -------------------------------------------------------------
    # 5. Trip Telemetry Samples (for waveform viewer & GPS replay)
    # -------------------------------------------------------------
    sample_trip_ids = ["T001", "T016", "T046", "T100", "T200"]
    trip_samples = {}
    for tid in sample_trip_ids:
        t_rows = df_telemetry[df_telemetry["Trip_ID"] == tid].to_dict(orient="records")
        trip_samples[tid] = t_rows

    # Write processed JSON fixtures
    with open(os.path.join(output_fixtures_dir, "processed_drivers.json"), "w") as f:
        json.dump(driver_stats, f, indent=2)
        
    with open(os.path.join(output_fixtures_dir, "processed_vehicles.json"), "w") as f:
        json.dump(vehicle_stats, f, indent=2)
        
    with open(os.path.join(output_fixtures_dir, "fleet_summary.json"), "w") as f:
        json.dump(fleet_summary, f, indent=2)
        
    with open(os.path.join(output_fixtures_dir, "pothole_gis_sample.json"), "w") as f:
        json.dump(potholes, f, indent=2)
        
    with open(os.path.join(output_fixtures_dir, "trips_telemetry_sample.json"), "w") as f:
        json.dump(trip_samples, f, indent=2)

    logger.info("Successfully calculated telematics physics metrics and saved JSON fixtures.")
    return df_d_proc, df_v_proc, fleet_summary, potholes, trip_samples


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    from src.data.telematics_generator import generate_telematics_dataset
    d, v, t, tel = generate_telematics_dataset()
    compute_telematics_metrics(d, v, t, tel)
