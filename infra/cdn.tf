# CloudFront: S3 static origin (default behavior) + the BFF ALB as a second
# origin for `/api/*` (design Decision 3's same-origin routing, Decision 2's
# "web and API share one origin"). `/internal/*` is deliberately NOT routed
# here — design-interfaces documents it as "not internet-exposed via CDN".

resource "aws_cloudfront_origin_access_control" "web" {
  name                              = "${local.name_prefix}-web-oac"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

resource "aws_cloudfront_distribution" "main" {
  enabled             = true
  default_root_object = "index.html"
  comment             = "${local.name_prefix} web + /api/* to the BFF"

  origin {
    domain_name              = aws_s3_bucket.web.bucket_regional_domain_name
    origin_id                = "web-s3"
    origin_access_control_id = aws_cloudfront_origin_access_control.web.id
  }

  origin {
    domain_name = aws_lb.api.dns_name
    origin_id   = "bff-alb"

    custom_origin_config {
      http_port              = 80
      https_port             = 443
      origin_protocol_policy = "http-only"
      origin_ssl_protocols   = ["TLSv1.2"]
    }
  }

  default_cache_behavior {
    allowed_methods        = ["GET", "HEAD"]
    cached_methods         = ["GET", "HEAD"]
    target_origin_id       = "web-s3"
    viewer_protocol_policy = "redirect-to-https"
    cache_policy_id        = local.cloudfront_managed_cache_policy_caching_optimized
  }

  ordered_cache_behavior {
    path_pattern             = "/api/*"
    allowed_methods          = ["GET", "HEAD", "OPTIONS", "PUT", "POST", "PATCH", "DELETE"]
    cached_methods           = ["GET", "HEAD"]
    target_origin_id         = "bff-alb"
    viewer_protocol_policy   = "https-only"
    cache_policy_id          = local.cloudfront_managed_cache_policy_caching_disabled
    origin_request_policy_id = local.cloudfront_managed_origin_request_policy_all_viewer_except_host
  }

  ordered_cache_behavior {
    path_pattern             = "/webhooks/*"
    allowed_methods          = ["GET", "HEAD", "OPTIONS", "PUT", "POST", "PATCH", "DELETE"]
    cached_methods           = ["GET", "HEAD"]
    target_origin_id         = "bff-alb"
    viewer_protocol_policy   = "https-only"
    cache_policy_id          = local.cloudfront_managed_cache_policy_caching_disabled
    origin_request_policy_id = local.cloudfront_managed_origin_request_policy_all_viewer_except_host
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  viewer_certificate {
    cloudfront_default_certificate = true
  }

  tags = {
    Name = "${local.name_prefix}-cdn"
  }
}
