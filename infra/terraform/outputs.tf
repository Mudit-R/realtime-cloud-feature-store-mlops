output "api_gateway_url" {
  description = "Live HTTPS API endpoint"
  value       = aws_apigatewayv2_stage.prod.invoke_url
}

output "lambda_function_url" {
  description = "Direct Lambda function URL"
  value       = aws_lambda_function_url.pricing_api_url.function_url
}

output "feature_lake_bucket" {
  description = "S3 feature lake bucket name"
  value       = aws_s3_bucket.feature_lake.bucket
}

output "dynamodb_table_name" {
  description = "DynamoDB online feature store table"
  value       = aws_dynamodb_table.feature_store.name
}

output "ecr_repository_url" {
  description = "ECR repository URL for Docker image pushes"
  value       = aws_ecr_repository.api_repo.repository_url
}
