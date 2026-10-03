# Task 13.2 (AWS reference IaC). Terraform chosen over CDK per the design's
# own open item ("IaC tool (Terraform vs CDK)"), for portability across the
# reference deployment described in design Decision 3 (another cloud is a
# deployment change, not a code change — Terraform's provider model fits
# that goal better than CDK's AWS-specific construct library).

terraform {
  required_version = ">= 1.5.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}
