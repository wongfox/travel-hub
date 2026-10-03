variable "aws_region" {
  description = "AWS region to deploy into. The design's own Open Questions flag cross-border data-transfer rules (Peruvian Law No. 29733) as a Legal-blocking decision before production — this default is a placeholder, not a Legal-approved choice."
  type        = string
  default     = "us-east-1"
}

variable "environment" {
  description = "Deployment environment name, applied as a tag and used to namespace resource names."
  type        = string
  default     = "dev"

  validation {
    condition     = contains(["dev", "staging", "production"], var.environment)
    error_message = "environment must be one of: dev, staging, production."
  }
}

variable "project_name" {
  description = "Short name used as a prefix for every resource this configuration creates."
  type        = string
  default     = "travel-hub"
}

# --- Offline-plannable validation support (do not invent real AWS identifiers) ---

variable "mock_credentials" {
  description = "When true (the default), the AWS provider uses dummy credentials and skips every credential/account-lookup API call, so `terraform validate`/`terraform plan` succeed with no real AWS account. Set to false for a real plan against a real account with real credentials supplied out-of-band (never in this repository)."
  type        = bool
  default     = true
}

variable "localstack_endpoint" {
  description = "Optional LocalStack (or other local AWS-API-compatible mock) endpoint, e.g. \"http://localhost:4566\". Leave null to use real AWS service endpoints. See README.md for the LocalStack plan path."
  type        = string
  default     = null
}

variable "aws_account_id" {
  description = "AWS account ID the KMS key policy's root-account statement scopes to. A placeholder (AWS's own example account ID, used throughout their documentation) is supplied by default — override with the real account ID via a tfvars file or TF_VAR_aws_account_id before planning against a real account. Never commit a real account ID here."
  type        = string
  default     = "123456789012"
}

# --- Networking ---

variable "vpc_cidr" {
  description = "CIDR block for the VPC."
  type        = string
  default     = "10.42.0.0/16"
}

variable "availability_zones" {
  description = "Availability zones to spread public/private subnets across. Exactly 2 is the minimum for an ALB + RDS Multi-AZ-capable subnet group."
  type        = list(string)
  default     = ["us-east-1a", "us-east-1b"]
}

# --- Database ---

variable "db_name" {
  description = "RDS PostgreSQL database name."
  type        = string
  default     = "travel_hub"
}

variable "db_username" {
  description = "RDS PostgreSQL master username."
  type        = string
  default     = "travel_hub_app"
}

variable "db_password" {
  description = "RDS PostgreSQL master password. No default — must be supplied via a tfvars file or TF_VAR_db_password, never committed. A real deployment should instead manage this via Secrets Manager's own rotation (see secrets.tf), referenced here only for initial provisioning."
  type        = string
  sensitive   = true
}

variable "db_instance_class" {
  description = "RDS instance class. db.t3.micro is a reference/cost-conscious default, not a production sizing recommendation."
  type        = string
  default     = "db.t3.micro"
}

# --- Compute / container images ---

variable "api_container_image" {
  description = "Container image URI for the `api` process (services/bff/Dockerfile, task 13.1). No default — a real deployment supplies its own ECR image URI; the placeholder below is for `terraform plan`'s own benefit, never a real account/registry."
  type        = string
  default     = "123456789012.dkr.ecr.us-east-1.amazonaws.com/travel-hub-bff:latest"
}

variable "worker_container_image" {
  description = "Container image URI for the `worker` process (services/bff/Dockerfile, task 13.1). Same placeholder convention as api_container_image."
  type        = string
  default     = "123456789012.dkr.ecr.us-east-1.amazonaws.com/travel-hub-bff:latest"
}

variable "feature_flag_overrides" {
  description = "Operator feature-flag overrides for BOTH the api and worker tasks: a JSON object of known flag keys to booleans, e.g. {\"wifi.checkout\":true} (services/bff/src/config/flags.ts, env var FEATURE_FLAG_OVERRIDES). Empty (default) keeps every FLAG_DEFAULTS value. Plain config, never secrets. A guarded flag still fails boot unless its go-live prerequisites (config/go-live-guards.ts) are met; unknown keys or malformed JSON also fail boot."
  type        = string
  default     = ""

  validation {
    condition     = var.feature_flag_overrides == "" || can(jsondecode(var.feature_flag_overrides))
    error_message = "feature_flag_overrides must be empty or a valid JSON object such as {\"wifi.checkout\":true}."
  }
}

variable "api_task_cpu" {
  description = "Fargate task CPU units for the `api` service."
  type        = number
  default     = 512
}

variable "api_task_memory" {
  description = "Fargate task memory (MiB) for the `api` service."
  type        = number
  default     = 1024
}

variable "worker_task_cpu" {
  description = "Fargate task CPU units for the `worker` service."
  type        = number
  default     = 512
}

variable "worker_task_memory" {
  description = "Fargate task memory (MiB) for the `worker` service."
  type        = number
  default     = 1024
}

variable "api_desired_count" {
  description = "Desired Fargate task count for the `api` service."
  type        = number
  default     = 1
}

variable "worker_desired_count" {
  description = "Desired Fargate task count for the `worker` service."
  type        = number
  default     = 1
}

variable "api_container_port" {
  description = "Port the `api` process listens on inside its container (services/bff's PORT env var default, see env.ts)."
  type        = number
  default     = 3000
}
