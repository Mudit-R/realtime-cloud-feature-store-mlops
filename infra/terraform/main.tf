terraform {
  required_version = ">= 1.5.0"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
  backend "s3" {
    bucket = "realtime-pricing-mlops-tfstate"
    key    = "state/terraform.tfstate"
    region = "ap-south-1"
  }
}

provider "aws" {
  region = var.aws_region
}

# ─────────────────────────────────────────────
# 1. S3: Feature Lakehouse + Model Artifacts
# ─────────────────────────────────────────────
resource "aws_s3_bucket" "feature_lake" {
  bucket        = "${var.project_name}-feature-lake-275361390147"
  force_destroy = false
  tags = {
    Project     = var.project_name
    Environment = var.environment
    ManagedBy   = "Terraform"
  }
}

resource "aws_s3_bucket_versioning" "lake_versioning" {
  bucket = aws_s3_bucket.feature_lake.id
  versioning_configuration { status = "Enabled" }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "lake_encryption" {
  bucket = aws_s3_bucket.feature_lake.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_public_access_block" "lake_block_public" {
  bucket                  = aws_s3_bucket.feature_lake.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# ─────────────────────────────────────────────
# 2. DynamoDB: Online Feature Store
# ─────────────────────────────────────────────
resource "aws_dynamodb_table" "feature_store" {
  name         = "${var.project_name}-feature-store"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "product_id"

  attribute {
    name = "product_id"
    type = "S"
  }

  ttl {
    attribute_name = "expires_at"
    enabled        = true
  }

  tags = {
    Project   = var.project_name
    Component = "OnlineFeatureStore"
  }
}

# ─────────────────────────────────────────────
# 3. ECR: Container Registry
# ─────────────────────────────────────────────
resource "aws_ecr_repository" "api_repo" {
  name                 = "${var.project_name}/api"
  image_tag_mutability = "MUTABLE"
  image_scanning_configuration { scan_on_push = true }
}

# ─────────────────────────────────────────────
# 4. IAM: Lambda Execution Role
# ─────────────────────────────────────────────
resource "aws_iam_role" "lambda_exec" {
  name = "${var.project_name}-lambda-exec"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "lambda.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })
}

resource "aws_iam_role_policy" "lambda_policy" {
  name = "${var.project_name}-lambda-policy"
  role = aws_iam_role.lambda_exec.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = ["s3:GetObject", "s3:PutObject", "s3:ListBucket"]
        Resource = [
          aws_s3_bucket.feature_lake.arn,
          "${aws_s3_bucket.feature_lake.arn}/*"
        ]
      },
      {
        Effect   = "Allow"
        Action   = ["dynamodb:GetItem", "dynamodb:PutItem", "dynamodb:UpdateItem", "dynamodb:Query"]
        Resource = aws_dynamodb_table.feature_store.arn
      },
      {
        Effect   = "Allow"
        Action   = ["logs:CreateLogGroup", "logs:CreateLogStream", "logs:PutLogEvents"]
        Resource = "arn:aws:logs:*:*:*"
      }
    ]
  })
}

resource "aws_iam_role_policy_attachment" "lambda_basic" {
  role       = aws_iam_role.lambda_exec.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

# ─────────────────────────────────────────────
# 5. Lambda: Inference Function
# ─────────────────────────────────────────────
resource "aws_lambda_function" "pricing_api" {
  function_name = "${var.project_name}-api"
  role          = aws_iam_role.lambda_exec.arn
  package_type  = "Image"
  image_uri     = "${aws_ecr_repository.api_repo.repository_url}:latest"
  memory_size   = var.lambda_memory_mb
  timeout       = var.lambda_timeout_seconds

  environment {
    variables = {
      USE_DYNAMODB          = "true"
      DYNAMODB_FEATURE_TABLE = aws_dynamodb_table.feature_store.name
      AWS_DEFAULT_REGION    = var.aws_region
      ENVIRONMENT           = var.environment
    }
  }

  tags = {
    Project   = var.project_name
    Component = "InferenceAPI"
  }
}

resource "aws_lambda_function_url" "pricing_api_url" {
  function_name      = aws_lambda_function.pricing_api.function_name
  authorization_type = "NONE"
  cors {
    allow_origins = ["*"]
    allow_methods = ["GET", "POST"]
    allow_headers = ["content-type"]
  }
}

# ─────────────────────────────────────────────
# 6. API Gateway: Public HTTPS Endpoint
# ─────────────────────────────────────────────
resource "aws_apigatewayv2_api" "pricing_api" {
  name          = "${var.project_name}-gateway"
  protocol_type = "HTTP"
  cors_configuration {
    allow_origins = ["*"]
    allow_methods = ["GET", "POST", "OPTIONS"]
    allow_headers = ["content-type", "authorization"]
  }
}

resource "aws_apigatewayv2_integration" "lambda_integration" {
  api_id                 = aws_apigatewayv2_api.pricing_api.id
  integration_type       = "AWS_PROXY"
  integration_uri        = aws_lambda_function.pricing_api.invoke_arn
  payload_format_version = "2.0"
}

resource "aws_apigatewayv2_route" "default_route" {
  api_id    = aws_apigatewayv2_api.pricing_api.id
  route_key = "$default"
  target    = "integrations/${aws_apigatewayv2_integration.lambda_integration.id}"
}

resource "aws_apigatewayv2_stage" "prod" {
  api_id      = aws_apigatewayv2_api.pricing_api.id
  name        = "$default"
  auto_deploy = true
}

resource "aws_lambda_permission" "api_gw_invoke" {
  statement_id  = "AllowAPIGatewayInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.pricing_api.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.pricing_api.execution_arn}/*/*"
}

# ─────────────────────────────────────────────
# 7. CloudWatch: Drift Alarm + Latency SLA
# ─────────────────────────────────────────────
resource "aws_cloudwatch_metric_alarm" "psi_drift_alarm" {
  alarm_name          = "${var.project_name}-feature-drift-psi"
  comparison_operator = "GreaterThanOrEqualToThreshold"
  evaluation_periods  = 2
  metric_name         = "pricing_feature_drift_psi"
  namespace           = "MLOps/DemandMonitoring"
  period              = 300
  statistic           = "Maximum"
  threshold           = 0.25
  alarm_description   = "PSI >= 0.25: demand distribution drift detected, retraining triggered."
  tags = { Component = "DriftMonitoring" }
}

resource "aws_cloudwatch_metric_alarm" "p99_latency_alarm" {
  alarm_name          = "${var.project_name}-p99-latency-breach"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 3
  metric_name         = "Duration"
  namespace           = "AWS/Lambda"
  period              = 60
  extended_statistic  = "p99"
  threshold           = 8000
  alarm_description   = "Lambda p99 latency exceeded 8s SLA."
  dimensions = { FunctionName = aws_lambda_function.pricing_api.function_name }
}
