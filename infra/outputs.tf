output "cloudfront_domain_name" {
  description = "Public domain name passengers access the app through."
  value       = aws_cloudfront_distribution.main.domain_name
}

output "api_alb_dns_name" {
  description = "Internal ALB DNS name in front of the `api` ECS service (CloudFront's `/api/*` origin)."
  value       = aws_lb.api.dns_name
}

output "rds_endpoint" {
  description = "RDS PostgreSQL connection endpoint."
  value       = aws_db_instance.main.endpoint
}

output "web_bucket_name" {
  description = "S3 bucket name the web static build deploys to."
  value       = aws_s3_bucket.web.bucket
}

output "precheckin_bucket_name" {
  description = "Dedicated S3 bucket for pre-check-in encrypted objects."
  value       = aws_s3_bucket.precheckin.bucket
}

output "precheckin_kms_key_arn" {
  description = "Dedicated KMS key ARN for pre-check-in envelope encryption. Decrypt is restricted to the worker IAM role only (see kms.tf's key policy)."
  value       = aws_kms_key.precheckin.arn
}

output "ecs_cluster_name" {
  description = "ECS cluster name hosting the api/worker services."
  value       = aws_ecs_cluster.main.name
}

output "worker_task_role_arn" {
  description = "IAM role ARN the worker task assumes — the only role the precheckin KMS key policy grants kms:Decrypt to."
  value       = aws_iam_role.worker_task.arn
}
