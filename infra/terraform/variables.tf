variable "aws_region" {
  description = "AWS region to deploy into"
  type        = string
  default     = "ap-south-1"
}

variable "project_name" {
  description = "Project name used for resource naming and tagging"
  type        = string
  default     = "realtime-pricing-mlops"
}

variable "environment" {
  description = "Deployment environment"
  type        = string
  default     = "production"
}

variable "lambda_memory_mb" {
  description = "Lambda function memory allocation"
  type        = number
  default     = 1024
}

variable "lambda_timeout_seconds" {
  description = "Lambda function timeout"
  type        = number
  default     = 30
}
