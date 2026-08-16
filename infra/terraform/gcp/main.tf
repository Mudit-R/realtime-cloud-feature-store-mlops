terraform {
  required_version = ">= 1.5.0"
  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 5.15.0"
    }
  }
}

provider "google" {
  project = var.gcp_project_id
  region  = var.gcp_region
}

# 1. GCP Artifact Registry Repository (For Docker Containers)
resource "google_artifact_registry_repository" "repo" {
  location      = var.gcp_region
  repository_id = "pulsestar-repo"
  description   = "PulseStar Telematics Docker Repository"
  format        = "DOCKER"
}

# 2. GCP Cloud Storage Bucket (For Feast Parquet Lakehouse & ML Models)
resource "google_storage_bucket" "model_artifacts" {
  name          = "${var.gcp_project_id}-telematics-artifacts"
  location      = var.gcp_region
  force_destroy = true
  uniform_bucket_level_access = true

  versioning {
    enabled = true
  }
}

# 3. GCP BigQuery Dataset (Offline Telematics Lakehouse)
resource "google_bigquery_dataset" "telematics_lakehouse" {
  dataset_id                  = "telematics_lakehouse"
  friendly_name               = "Telematics Feature Lakehouse"
  description                 = "Historical driver safety, vehicle diagnostics, and IMU telemetry points"
  location                    = var.gcp_region
  default_table_expiration_ms = null
}

# 4. GCP Cloud Pub/Sub Topic & Subscription (Real-Time Sensor Ingestion)
resource "google_pubsub_topic" "sensor_stream" {
  name = "telematics-sensor-stream"
  message_retention_duration = "86600s"
}

resource "google_pubsub_subscription" "sensor_sub" {
  name  = "telematics-stream-sub"
  topic = google_pubsub_topic.sensor_stream.name

  ack_deadline_seconds = 20
  retain_acked_messages = false
}

# 5. GCP Cloud Run Service (FastAPI + Neobrutalist Dashboard - Scale-to-Zero = ₹0 Idle Cost)
resource "google_cloud_run_v2_service" "telematics_api" {
  name     = "${var.app_name}-api"
  location = var.gcp_region
  ingress  = "INGRESS_TRAFFIC_ALL"

  template {
    scaling {
      min_instance_count = 0  # ₹0 cost when idle
      max_instance_count = 5
    }

    containers {
      image = var.container_image

      resources {
        limits = {
          cpu    = "1000m"
          memory = "1024Mi"
        }
      }

      env {
        name  = "GCP_PROJECT_ID"
        value = var.gcp_project_id
      }
      env {
        name  = "GCP_PUBSUB_TOPIC"
        value = google_pubsub_topic.sensor_stream.name
      }
      env {
        name  = "BIGQUERY_DATASET"
        value = google_bigquery_dataset.telematics_lakehouse.dataset_id
      }
    }
  }
}

# Allow Unauthenticated Public Access to Cloud Run (for live portfolio demo)
resource "google_cloud_run_service_iam_binding" "public_access" {
  location = google_cloud_run_v2_service.telematics_api.location
  service  = google_cloud_run_v2_service.telematics_api.name
  role     = "roles/run.invoker"
  members  = ["allUsers"]
}
