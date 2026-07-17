import os
import json
from datetime import datetime, timedelta
import numpy as np
import pandas as pd
import logging

logger = logging.getLogger("src.data.telematics_generator")

DRIVER_NAMES = [
    "Aarav Sharma", "Rohan Verma", "Vikram Malhotra", "Aditya Patel", "Suresh Kumar",
    "Karan Singh", "Deepak Gupta", "Rahul Nair", "Manoj Joshi", "Anand Rao",
    "Pooja Mehta", "Kunal Shah", "Rajesh Yadav", "Amit Choudhury", "Praveen Tiwari",
    "Naveen Reddy", "Sanjay Mishra", "Harish Pillai", "Arjun Bhatia", "Vikas Dubey",
    "Gaurav Saxena", "Nitin Das", "Sunil Kulkarni", "Mohit Pandey", "Ravi Shankar",
    "Pradeep Soni", "Ashok Sen", "Tarun Roy", "Manish Jain", "Chetan Deshmukh"
]

VEHICLE_MODELS = [
    ("Honda Activa 6G", "ICE Scooter", 110),
    ("TVS Jupiter 125", "ICE Scooter", 125),
    ("Bajaj Pulsar 150", "ICE Motorcycle", 150),
    ("Hero Splendor Plus", "ICE Motorcycle", 100),
    ("Ather 450X", "Electric Scooter", 3.7),
    ("TVS iQube", "Electric Scooter", 3.0),
    ("Honda Shine 125", "ICE Motorcycle", 125),
    ("Suzuki Access 125", "ICE Scooter", 125),
    ("Ola S1 Pro", "Electric Scooter", 4.0),
    ("Bajaj Chetak", "Electric Scooter", 3.2)
]

ZONES = ["Central", "North", "South", "East", "West"]
SHIFTS = ["Morning", "Afternoon", "Evening", "Night"]
ZONE_LAT_LON = {
    "Central": (12.9716, 77.5946),
    "North": (13.0358, 77.5970),
    "South": (12.9141, 77.6109),
    "East": (12.9784, 77.6408),
    "West": (12.9900, 77.5300)
}
TRIP_TYPES = ["Food_Delivery", "Quick_Commerce", "Parcel_Delivery", "On_Demand_Rider"]


def generate_telematics_dataset(output_dir="data/raw", lake_dir="data/lakehouse", seed=42):
    """
    Generates a full relational telematics dataset:
    - Drivers (30 profiles)
    - Vehicles (30 profiles)
    - Trips (450 aggregate trip logs)
    - Telemetry (~11,600+ minute-level GPS and IMU sensor rows)
    """
    np.random.seed(seed)
    os.makedirs(output_dir, exist_ok=True)
    os.makedirs(lake_dir, exist_ok=True)

    # 1. Driver Profiles
    driver_profiles = []
    for i in range(30):
        d_id = f"D{i+1:02d}"
        name = DRIVER_NAMES[i]
        age = int(np.random.randint(22, 48))
        exp = int(np.clip(age - 20 - np.random.randint(0, 5), 1, 15))
        zone = np.random.choice(ZONES)
        shift = np.random.choice(SHIFTS, p=[0.35, 0.30, 0.25, 0.10])
        base_rating = round(float(np.random.uniform(4.2, 4.95)), 2)
        if i in [3, 7, 14, 21, 28]:
            archetype = "Aggressive"
            base_rating = round(float(np.random.uniform(3.7, 4.3)), 2)
        elif i in [1, 9, 18, 25]:
            archetype = "Distracted_Erratic"
            base_rating = round(float(np.random.uniform(3.9, 4.4)), 2)
        else:
            archetype = "Safe_Smooth"
        
        driver_profiles.append({
            "Driver_ID": d_id,
            "Driver_Name": name,
            "Age": age,
            "Experience_Years": exp,
            "Primary_Zone": zone,
            "Shift_Preference": shift,
            "Rating": base_rating,
            "Total_Trips_Completed": 15,
            "Archetype": archetype
        })
    df_drivers = pd.DataFrame(driver_profiles)

    # 2. Vehicle Profiles
    vehicle_profiles = []
    for i in range(30):
        v_id = f"V{i+1:02d}"
        model_idx = i % len(VEHICLE_MODELS)
        model, v_type, cap = VEHICLE_MODELS[model_idx]
        year = int(np.random.choice([2019, 2020, 2021, 2022, 2023, 2024], p=[0.1, 0.15, 0.25, 0.25, 0.15, 0.1]))
        odo = int(np.random.uniform(12000, 58000))
        days_since_service = int(np.random.randint(15, 160))
        
        if i in [2, 11, 22]:
            wear_condition = "Suspension_Wear"
        elif i in [5, 17, 27]:
            wear_condition = "Bearing_Misalignment"
        elif i in [8, 19]:
            wear_condition = "Brake_Warp"
        else:
            wear_condition = "Normal"
            
        vehicle_profiles.append({
            "Vehicle_ID": v_id,
            "Model": model,
            "Vehicle_Type": v_type,
            "Capacity_CC_or_kWh": cap,
            "Manufacturing_Year": year,
            "Odometer_KM": odo,
            "Days_Since_Last_Service": days_since_service,
            "Wear_Condition": wear_condition
        })
    df_vehicles = pd.DataFrame(vehicle_profiles)

    # 3. Trips & Telemetry Generation
    trip_records = []
    telemetry_records = []

    start_base_date = datetime(2026, 8, 10, 8, 0, 0)
    trip_counter = 1
    telemetry_counter = 1

    for d_idx, d_row in df_drivers.iterrows():
        d_id = d_row["Driver_ID"]
        d_arch = d_row["Archetype"]
        d_zone = d_row["Primary_Zone"]
        base_lat, base_lon = ZONE_LAT_LON[d_zone]
        
        assigned_vehicle = df_vehicles.iloc[d_idx]
        v_id = assigned_vehicle["Vehicle_ID"]
        v_wear = assigned_vehicle["Wear_Condition"]
        
        for t_idx in range(15):
            t_id = f"T{trip_counter:03d}"
            day_offset = int(t_idx % 7)
            hour_base = 8 + int((t_idx * 1.5) % 14)
            if d_row["Shift_Preference"] == "Night":
                hour_base = 21 + int(t_idx % 6)
                if hour_base >= 24:
                    hour_base -= 24
                    
            trip_start_time = start_base_date + timedelta(days=day_offset, hours=hour_base, minutes=int(np.random.randint(0, 45)))
            duration_minutes = int(np.random.randint(14, 38))
            trip_end_time = trip_start_time + timedelta(minutes=duration_minutes)
            
            t_type = np.random.choice(TRIP_TYPES, p=[0.45, 0.30, 0.15, 0.10])
            
            curr_lat = base_lat + np.random.uniform(-0.02, 0.02)
            curr_lon = base_lon + np.random.uniform(-0.02, 0.02)
            
            trip_speeds = []
            cur_speed = 0.0
            phone_mount = np.random.choice(["Handlebar_Mount", "Pocket"], p=[0.85, 0.15])
            
            for m in range(duration_minutes):
                ts = trip_start_time + timedelta(minutes=m)
                
                # Kinematic state machine
                if m == 0:
                    speed = 0.0
                    acc_y = 0.0
                elif m == duration_minutes - 1:
                    speed = 0.0
                    acc_y = -round(float(np.random.uniform(1.5, 3.5)), 2)
                else:
                    if d_arch == "Aggressive":
                        target_speed = np.random.choice([0, 35, 52, 68, 74], p=[0.05, 0.20, 0.35, 0.25, 0.15])
                    elif d_arch == "Distracted_Erratic":
                        target_speed = np.random.choice([0, 25, 42, 58], p=[0.10, 0.35, 0.40, 0.15])
                    else:  # Safe_Smooth
                        target_speed = np.random.choice([0, 28, 42, 48], p=[0.08, 0.37, 0.45, 0.10])
                    
                    speed_diff = target_speed - cur_speed
                    acc_y = np.clip(speed_diff / 3.6 / 5.0, -4.5, 3.8)
                    
                    # Add deliberate aggressive spikes
                    if d_arch == "Aggressive" and np.random.rand() < 0.22:
                        acc_y = np.random.choice([
                            round(float(np.random.uniform(2.8, 3.9)), 2),
                            round(float(np.random.uniform(-4.5, -3.1)), 2)
                        ])
                    elif np.random.rand() < 0.04:
                        acc_y = round(float(np.random.uniform(-3.5, 2.9)), 2)
                        
                    cur_speed = max(0.0, cur_speed + (acc_y * 3.6 * 0.8))
                    speed = round(cur_speed, 1)
                
                trip_speeds.append(speed)
                
                # Lateral Acceleration Ax & Gyro Z
                if speed > 10:
                    if d_arch == "Aggressive" and np.random.rand() < 0.18:
                        acc_x = round(float(np.random.choice([-1, 1]) * np.random.uniform(2.9, 4.2)), 2)
                        gyro_z = round(float(np.random.choice([-1, 1]) * np.random.uniform(38.0, 65.0)), 1)
                    else:
                        acc_x = round(float(np.random.normal(0.0, 0.7)), 2)
                        gyro_z = round(float(np.random.normal(0.0, 10.0)), 1)
                else:
                    acc_x = round(float(np.random.normal(0.0, 0.2)), 2)
                    gyro_z = round(float(np.random.normal(0.0, 3.0)), 1)
                
                # Vertical Acceleration Az (Gravity 9.81 + Road shocks & Mechanical wear)
                base_az = 9.81
                if v_wear == "Suspension_Wear":
                    shock_noise = np.random.normal(0.0, 1.8)
                    if np.random.rand() < 0.15:
                        shock_noise += np.random.choice([-1, 1]) * np.random.uniform(2.5, 5.0)
                else:
                    shock_noise = np.random.normal(0.0, 0.55)
                    if np.random.rand() < 0.03:
                        shock_noise += np.random.choice([-1, 1]) * np.random.uniform(1.8, 3.2)
                
                acc_z = round(float(base_az + shock_noise), 2)
                
                # Gyro X (Pitch) & Gyro Y (Roll)
                gyro_x = round(float(acc_y * 3.5 + np.random.normal(0.0, 2.0)), 1)
                
                if v_wear == "Bearing_Misalignment" and speed > 15:
                    bearing_jitter = np.random.normal(0.0, 18.0)
                    gyro_y = round(float(acc_x * 8.0 + bearing_jitter), 1)
                else:
                    gyro_y = round(float(acc_x * 8.0 + np.random.normal(0.0, 3.5)), 1)
                
                # GPS movement update
                heading = np.random.uniform(0, 2 * np.pi)
                dist_traveled_km = (speed / 60.0)
                curr_lat += (dist_traveled_km / 111.0) * np.cos(heading) * 0.7
                curr_lon += (dist_traveled_km / 111.0) * np.sin(heading) * 0.7
                
                telemetry_records.append({
                    "Telemetry_ID": f"TEL_{telemetry_counter:06d}",
                    "Trip_ID": t_id,
                    "Timestamp": ts.strftime("%Y-%m-%d %H:%M:%S"),
                    "Minute_Offset": m,
                    "Latitude": round(float(curr_lat), 6),
                    "Longitude": round(float(curr_lon), 6),
                    "Altitude": round(float(920.0 + np.random.uniform(-5, 5)), 1),
                    "Speed_KMH": speed,
                    "Acceleration_X": acc_x,
                    "Acceleration_Y": round(float(acc_y), 2),
                    "Acceleration_Z": acc_z,
                    "Gyro_X": gyro_x,
                    "Gyro_Y": gyro_y,
                    "Gyro_Z": gyro_z,
                    "Phone_Mount": phone_mount
                })
                telemetry_counter += 1
            
            avg_speed = round(float(np.mean(trip_speeds)), 1)
            max_speed = round(float(np.max(trip_speeds)), 1)
            distance_km = round(float(avg_speed * (duration_minutes / 60.0)), 2)
            if distance_km < 1.0:
                distance_km = round(float(np.random.uniform(2.5, 6.0)), 2)
                
            trip_records.append({
                "Trip_ID": t_id,
                "Driver_ID": d_id,
                "Vehicle_ID": v_id,
                "Trip_Date": trip_start_time.strftime("%Y-%m-%d"),
                "Start_Time": trip_start_time.strftime("%Y-%m-%d %H:%M:%S"),
                "End_Time": trip_end_time.strftime("%Y-%m-%d %H:%M:%S"),
                "Duration_Minutes": duration_minutes,
                "Distance_KM": distance_km,
                "Avg_Speed_KMH": avg_speed,
                "Max_Speed_KMH": max_speed,
                "Trip_Type": t_type
            })
            trip_counter += 1

    df_trips = pd.DataFrame(trip_records)
    df_telemetry = pd.DataFrame(telemetry_records)

    # Save to Raw CSV
    df_drivers.to_csv(os.path.join(output_dir, "Drivers.csv"), index=False)
    df_vehicles.to_csv(os.path.join(output_dir, "Vehicles.csv"), index=False)
    df_trips.to_csv(os.path.join(output_dir, "Trips.csv"), index=False)
    df_telemetry.to_csv(os.path.join(output_dir, "Telemetry.csv"), index=False)

    # Save to Parquet Lakehouse
    df_drivers.to_parquet(os.path.join(lake_dir, "drivers.parquet"), index=False)
    df_vehicles.to_parquet(os.path.join(lake_dir, "vehicles.parquet"), index=False)
    df_trips.to_parquet(os.path.join(lake_dir, "trips.parquet"), index=False)
    df_telemetry.to_parquet(os.path.join(lake_dir, "telemetry.parquet"), index=False)

    logger.info(f"Generated {len(df_drivers)} drivers, {len(df_vehicles)} vehicles, {len(df_trips)} trips, {len(df_telemetry)} telemetry rows.")
    return df_drivers, df_vehicles, df_trips, df_telemetry


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    generate_telematics_dataset()
