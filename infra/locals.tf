locals {
  name_prefix = "${var.project_name}-${var.environment}"

  # AWS's own documented, fixed CloudFront managed cache policy IDs (these
  # are the same values in every AWS account — hardcoded here deliberately
  # instead of via a `data "aws_cloudfront_cache_policy"` lookup, so
  # `terraform plan` never needs a live API call just to resolve them).
  # https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/using-managed-cache-policies.html
  cloudfront_managed_cache_policy_caching_optimized = "658327ea-f89d-4fab-a63d-7e88639e58f6"
  cloudfront_managed_cache_policy_caching_disabled  = "4135ea2d-6df8-44a3-9df3-4b5a84be39ad"

  # AWS's own documented, fixed CloudFront managed origin-request policy ID
  # for forwarding everything except the Host header to a custom origin
  # (needed on the `/api/*` behavior so the BFF sees the real request).
  # https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/using-managed-origin-request-policies.html
  cloudfront_managed_origin_request_policy_all_viewer_except_host = "b689b0a8-53d0-40ab-baf2-68738e2966ac"
}
