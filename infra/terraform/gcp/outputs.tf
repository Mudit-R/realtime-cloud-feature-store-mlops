output "cloud_run_url" {
  description = "Public URL of the deployed Telematics API & Dashboard on GCP Cloud Run"
  value       = google_cloud_run_v2_service.telematics_api.uri
}

output "artifact_registry_repo" {
  description = "Artifact Registry Docker image path"
  value       = "${var.gcp_region}-docker.pkg.dev/${var.gcp_project_id}/${google_artifact_registry_repository.repo.name}"
}

output "pubsub_topic_id" {
  description = "GCP Cloud Pub/Sub Topic ID"
  value       = google_pubsub_topic.sensor_stream.id
}

output "bigquery_dataset_id" {
  description = "BigQuery Lakehouse Dataset ID"
  value       = google_bigquery_dataset.telematics_lakehouse.id
}
