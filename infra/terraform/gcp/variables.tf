variable "gcp_project_id" {
  description = "Google Cloud Project ID"
  type        = string
  default     = "project-02ed109f-3be3-43b8-866"
}

variable "gcp_region" {
  description = "GCP Deployment Region"
  type        = string
  default     = "asia-south1" # Mumbai (low latency for India)
}

variable "app_name" {
  description = "Application base name"
  type        = string
  default     = "pulsestar-telematics"
}

variable "container_image" {
  description = "Container image URL in Artifact Registry"
  type        = string
  default     = "asia-south1-docker.pkg.dev/project-02ed109f-3be3-43b8-866/pulsestar-repo/telematics-api:latest"
}
