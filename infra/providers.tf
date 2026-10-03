# `var.mock_credentials = true` (the default — see variables.tf) lets both
# `terraform validate` and `terraform plan` run with no real AWS account or
# credentials, by supplying throwaway dummy keys and telling the provider to
# skip every credential/account-lookup API call it would otherwise make.
# Flip it to `false` (and supply real credentials via the provider's normal
# mechanisms — env vars, a shared credentials file, SSO, etc.) to plan
# against a real AWS account. See `README.md` for both paths.
provider "aws" {
  region = var.aws_region

  access_key                  = var.mock_credentials ? "mock_access_key" : null
  secret_key                  = var.mock_credentials ? "mock_secret_key" : null
  skip_credentials_validation = var.mock_credentials
  skip_requesting_account_id  = var.mock_credentials
  skip_metadata_api_check     = var.mock_credentials

  # Only populated when `var.localstack_endpoint` is set (e.g. running a
  # LocalStack-backed `terraform plan` locally, see README.md); every value
  # stays `null` (real AWS endpoints) otherwise.
  endpoints {
    s3                     = var.localstack_endpoint
    ecs                    = var.localstack_endpoint
    ec2                    = var.localstack_endpoint
    elasticloadbalancingv2 = var.localstack_endpoint
    rds                    = var.localstack_endpoint
    kms                    = var.localstack_endpoint
    secretsmanager         = var.localstack_endpoint
    cloudfront             = var.localstack_endpoint
    iam                    = var.localstack_endpoint
    sts                    = var.localstack_endpoint
    logs                   = var.localstack_endpoint
  }

  default_tags {
    tags = {
      Project     = "travel-hub"
      Environment = var.environment
      ManagedBy   = "terraform"
    }
  }
}
