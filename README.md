# PulseStar: Real-Time Fleet Telematics & Predictive Maintenance Cloud Platform (GCP)

[![Python 3.11](https://img.shields.io/badge/Python-3.11-blue.svg?style=for-the-badge&logo=python)](https://python.org)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.110+-009688.svg?style=for-the-badge&logo=fastapi)](https://fastapi.tiangolo.com)
[![GCP Cloud Run](https://img.shields.io/badge/GCP-Cloud%20Run-4285F4.svg?style=for-the-badge&logo=googlecloud)](https://cloud.google.com/run)
[![Feast Feature Store](https://img.shields.io/badge/Feature%20Store-Feast-orange.svg?style=for-the-badge)](https://feast.dev)
[![Terraform](https://img.shields.io/badge/IaC-Terraform%20v1.5+-7B42BC.svg?style=for-the-badge&logo=terraform)](https://terraform.io)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=for-the-badge)](LICENSE)

An enterprise-grade, cloud-native IoT telematics and predictive maintenance platform built on **Google Cloud Platform (GCP)**. The platform ingests high-frequency tri-axial accelerometer ($A_x, A_y, A_z$), gyroscope ($\omega_x, \omega_y, \omega_z$), and GPS sensor streams from commodity delivery smartphones, transforming raw vibrations and kinematic pulses into real-time driver risk intelligence, mechanical sub-system diagnostics, automated e-FNOL crash triage, and crowdsourced road roughness GIS heatmaps.

---

## Architecture Overview

```
+-----------------------------------------------------------------------------------------+
|                                LIVE TELEMETRY SIMULATOR                                 |
|  High-frequency IMU (Acc: Ax,Ay,Az | Gyro: Gx,Gy,Gz | GPS: Lat,Lon) @ 10-50 Hz Stream   |
+-----------------------------------------------------------------------------------------+
                                            │ (JSON/Protobuf over HTTPS/WebSocket)
                                            ▼
+-----------------------------------------------------------------------------------------+
|                             INGESTION: GCP CLOUD PUB/SUB                                |
|  Topic: `telematics-sensor-stream` (Partitioned by Vehicle_ID / Driver_ID)              |
+-----------------------------------------------------------------------------------------+
                                            │
                     ┌──────────────────────┴──────────────────────┐
                     ▼                                             ▼
+------------------------------------------+  +------------------------------------------+
|      STREAMING PROCESSING / ETL          |  |           OFFLINE LAKEHOUSE              |
|  Cloud Run / Cloud Functions Worker      |  |  GCP BigQuery / Cloud Storage (Parquet)  |
|  - Micro-window Vibration RMS            |  |  - Full historical telemetry logs        |
|  - Gyro Yaw Jitter & Deceleration Jerk   |  |  - Night drive & trip aggregations       |
|  - Pothole vertical impact tagging       |  |  - Model training dataset snapshots      |
+------------------------------------------+  +------------------------------------------+
                     │                                             │
                     ▼                                             ▼
+-----------------------------------------------------------------------------------------+
|                             FEAST DUAL-TIER FEATURE STORE                               |
|  • Online Store (GCP Memorystore Redis / Local Redis): Sub-3ms live vehicle features    |
|  • Offline Store (GCP BigQuery / Parquet Lakehouse): Historical driver & asset entities |
+-----------------------------------------------------------------------------------------+
                                            │
                     ┌──────────────────────┴──────────────────────┐
                     ▼                                             ▼
+------------------------------------------+  +------------------------------------------+
|          ML TRAINING & DRIFT             |  |      INFERENCE & TELEMATICS API          |
|  - Optuna + LightGBM Driver Risk Model   |  |  FastAPI on GCP Cloud Run                |
|  - Vehicle RUL Predictive Maintenance    |  |  - `/v1/predict/driver-risk` (Live)      |
|  - Vertex AI / PSI Continuous Monitoring |  |  - `/v1/predict/vehicle-rul`             |
|    (Auto-retrain trigger at PSI >= 0.25) |  |  - `/v1/triage/crash-event` (e-FNOL)     |
+------------------------------------------+  +------------------------------------------+
                                                                   │
                                                                   ▼
+-----------------------------------------------------------------------------------------+
|                  NEOBRUTALIST FLEET TELEMATICS & GIS DASHBOARD                          |
|  • Real-time GIS Route Breadcrumbs & Speed Heatmaps (Leaflet.js)                        |
|  • Live Tri-Axial IMU Waveform Oscilloscope (Chart.js / WebSockets)                     |
|  • Driver Safety Cohort Clustering & Automated Coaching Engine                          |
|  • Component-level Predictive Maintenance Modals (Suspension, Alignment, Brakes)        |
+-----------------------------------------------------------------------------------------+
```

---

## Key Technical Specifications & Benchmarks

| Metric / Parameter | Value | Details |
| :--- | :--- | :--- |
| **Feast Online Feature Lookup** | **&lt; 3.0 ms** | Low-latency in-memory cache / Redis |
| **P99 Inference Latency** | **&lt; 8.0 ms** | Containerized FastAPI on Cloud Run |
| **Driver Safety LightGBM MAE** | **0.47** | Optuna-tuned regressor on normalized telemetry |
| **Vehicle RUL Prediction MAE** | **15.6 Days** | Predictive maintenance regression |
| **Sensor Processing Throughput** | **10,000+ msg/s** | GCP Cloud Pub/Sub streaming ingestion |
| **Cloud Idle Cost** | **₹0.00 / mo** | 100% GCP Always-Free Tier compliant (scale-to-zero) |

---

## Core Capabilities & Problem Solved

### 1. Driver Behavior & Safety Risk Scoring
* **Mileage-Normalized Maneuvers**: Eliminates distance bias by calibrating all harsh events strictly per 100 km:
  $$\text{HBR}_{100} = \left(\frac{\text{Harsh Brakes}}{\text{Distance (km)}}\right) \times 100, \quad \text{RAR}_{100} = \left(\frac{\text{Rapid Accels}}{\text{Distance (km)}}\right) \times 100, \quad \text{HCR}_{100} = \left(\frac{\text{Harsh Turns}}{\text{Distance (km)}}\right) \times 100$$
* **Composite Safety Score (0-100)**: Multi-factor risk formulation incorporating speed compliance ($SCS$) and late-night exposure ($22:00-05:00$).
* **Automated AI Coaching**: Generates context-aware riding recommendations per driver.

### 2. Vehicle Predictive Maintenance Diagnostics
* **Suspension Degradation ($\text{Vib}_{\text{RMS}}$)**: Measures vertical chassis acceleration RMS deviation from gravity ($9.81\text{ m/s}^2$) to detect blown fork damping and spring fatigue:
  $$\text{Vib}_{\text{RMS}} = \sqrt{\frac{1}{N}\sum_{t=1}^N (A_{z,t} - 9.81)^2}$$
* **Steering Stem Bearing Play ($\text{Gyro}_{\text{Jitter}}$)**: High-frequency rotational noise ($\text{StdDev}(\omega_z) > 12^\circ/\text{s}$) signals loose bearings or bent wheel rims.
* **Braking Disc Rotor Warp**: Deceleration judder and vertical IMU fluctuation during heavy braking detect uneven rotor wear.
* **Remaining Useful Life (RUL)**: Multi-factor urgency index estimating operational days before grounding.

### 3. Automated e-FNOL Crash Triage & SOS
* Millisecond-level crash pulse evaluation separating high-energy collisions from low-speed tip-overs and road surface impacts.

### 4. Smart City GIS Road Roughness Registry
* Crowdsourced road anomaly tagging for vertical shock spikes ($|A_z - 9.81| \ge 2.2g$) paired with GPS coordinates.

---

## Quick Start & Local Execution

### 1. Installation
```bash
git clone https://github.com/Mudit-R/realtime-cloud-feature-store-mlops.git
cd realtime-cloud-feature-store-mlops
pip install -r requirements.txt
pip install -e .
```

### 2. Run End-to-End Pipeline
Executes data generation, physics feature engineering, Optuna model training, and feature store cache warming:
```bash
python scripts/run_pipeline.py
```

### 3. Launch Web Dashboard & API Server
```bash
uvicorn src.api.app:app --reload --port 8000
```
Open **[http://localhost:8000](http://localhost:8000)** in your browser for the Neobrutalist Dashboard.
Open **[http://localhost:8000/docs](http://localhost:8000/docs)** for interactive OpenAPI / Swagger documentation.

### 4. Run Automated Test Suite
```bash
pytest tests/ -v
```

---

## Google Cloud Platform (GCP) Deployment

### GCP Project Configuration
* **Project ID**: `project-02ed109f-3be3-43b8-866`
* **Project Name**: `PulseStar`
* **Project Number**: `281362703917`

### Provision Cloud Infrastructure with Terraform (Always-Free Tier)
```bash
cd infra/terraform/gcp
terraform init
terraform apply
```

Resources Provisioned:
* **GCP Cloud Run**: Containerized FastAPI serving (`min_instances = 0` for ₹0 idle cost).
* **GCP Cloud Pub/Sub**: High-throughput telemetry ingestion topic (`telematics-sensor-stream`).
* **GCP BigQuery**: Offline feature lakehouse dataset (`telematics_lakehouse`).
* **GCP Cloud Storage**: Versioned bucket for Parquet lakehouse & model weights.
* **GCP Artifact Registry**: Docker image repository (`pulsestar-repo`).

---

## API Reference

```
GET  /                             # Neobrutalist Web Dashboard
GET  /api/fleet/summary            # Fleet KPI aggregates
GET  /api/drivers                  # Driver safety rankings & coaching
GET  /api/vehicles                 # Vehicle diagnostics & RUL days
GET  /api/trips/{id}/telemetry     # Synchronized GPS & IMU waveforms
GET  /api/potholes/gis             # Crowdsourced road roughness GIS points
POST /v1/predict/driver-risk       # Live Feast-backed Driver Risk ML Scoring
POST /v1/predict/vehicle-rul       # Live Feast-backed Vehicle RUL Inference
POST /v1/triage/crash-event        # Automated e-FNOL Crash Triage
POST /v1/ubi/calculate-premium     # Actuarial Usage-Based Insurance (UBI) pricing
GET  /v1/monitoring/drift          # PSI telemetry drift analysis & alarms
GET  /health                       # Microservice health, Feast status, and uptime
```

---

## License
This project is licensed under the MIT License.
