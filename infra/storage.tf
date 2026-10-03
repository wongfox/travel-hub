# --- Static web bucket (design Decision 3: "CloudFront, static web from S3") ---

resource "aws_s3_bucket" "web" {
  bucket = "${local.name_prefix}-web"

  tags = {
    Name = "${local.name_prefix}-web"
  }
}

resource "aws_s3_bucket_public_access_block" "web" {
  bucket = aws_s3_bucket.web.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_server_side_encryption_configuration" "web" {
  bucket = aws_s3_bucket.web.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

# Only CloudFront (via its Origin Access Control, see cdn.tf) may read from
# this bucket — never a direct public S3 URL.
resource "aws_s3_bucket_policy" "web" {
  bucket = aws_s3_bucket.web.id
  policy = data.aws_iam_policy_document.web_bucket_cloudfront_only.json
}

data "aws_iam_policy_document" "web_bucket_cloudfront_only" {
  statement {
    sid    = "AllowCloudFrontServicePrincipalReadOnly"
    effect = "Allow"

    principals {
      type        = "Service"
      identifiers = ["cloudfront.amazonaws.com"]
    }

    actions   = ["s3:GetObject"]
    resources = ["${aws_s3_bucket.web.arn}/*"]

    condition {
      test     = "StringEquals"
      variable = "AWS:SourceArn"
      values   = [aws_cloudfront_distribution.main.arn]
    }
  }
}

# --- Pre-check-in document bucket (design's Security and Privacy Design
# section: "a dedicated private bucket (public access blocked, SSE-KMS as
# second layer, TLS-only policy, no versioning so deletes are real, access
# logging)") ---

resource "aws_s3_bucket" "precheckin" {
  bucket = "${local.name_prefix}-precheckin-documents"

  tags = {
    Name = "${local.name_prefix}-precheckin-documents"
  }
}

resource "aws_s3_bucket_public_access_block" "precheckin" {
  bucket = aws_s3_bucket.precheckin.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# No versioning: the design requires deletes to be real (crypto-shredding +
# object delete on purge, task 8.5) — a versioned bucket would keep deleted
# object versions around, defeating that retention guarantee.
resource "aws_s3_bucket_versioning" "precheckin" {
  bucket = aws_s3_bucket.precheckin.id

  versioning_configuration {
    status = "Disabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "precheckin" {
  bucket = aws_s3_bucket.precheckin.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm     = "aws:kms"
      kms_master_key_id = aws_kms_key.precheckin.arn
    }
    bucket_key_enabled = true
  }
}

resource "aws_s3_bucket_logging" "precheckin" {
  bucket        = aws_s3_bucket.precheckin.id
  target_bucket = aws_s3_bucket.access_logs.id
  target_prefix = "precheckin-access-logs/"
}

resource "aws_s3_bucket" "access_logs" {
  bucket = "${local.name_prefix}-access-logs"

  tags = {
    Name = "${local.name_prefix}-access-logs"
  }
}

resource "aws_s3_bucket_public_access_block" "access_logs" {
  bucket = aws_s3_bucket.access_logs.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# TLS-only policy on the precheckin bucket: the application layer already
# encrypts every object's plaintext before it ever reaches S3 (envelope
# encryption, task 8.3), this policy additionally refuses any request that
# does not itself arrive over TLS.
resource "aws_s3_bucket_policy" "precheckin_tls_only" {
  bucket = aws_s3_bucket.precheckin.id
  policy = data.aws_iam_policy_document.precheckin_tls_only.json
}

data "aws_iam_policy_document" "precheckin_tls_only" {
  statement {
    sid    = "DenyInsecureTransport"
    effect = "Deny"

    principals {
      type        = "AWS"
      identifiers = ["*"]
    }

    actions   = ["s3:*"]
    resources = [aws_s3_bucket.precheckin.arn, "${aws_s3_bucket.precheckin.arn}/*"]

    condition {
      test     = "Bool"
      variable = "aws:SecureTransport"
      values   = ["false"]
    }
  }
}
