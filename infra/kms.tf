# Dedicated KMS key for pre-check-in objects (design's Security and Privacy
# Design section, task 13.2's acceptance criterion): `kms:Decrypt` is
# restricted to the `worker` task role ONLY — the design states "only the
# worker role may KMS-decrypt with the pre check-in key... only in the
# handoff job; api can encrypt/put, not decrypt." The api task role below is
# granted `GenerateDataKey`/`Encrypt`/`DescribeKey` but never `Decrypt`.

resource "aws_kms_key" "precheckin" {
  description             = "Envelope-encryption key for pre-check-in photo/ID objects (design Decision 15, task 8.3). Decrypt restricted to the worker IAM role only."
  deletion_window_in_days = 30
  enable_key_rotation     = true

  policy = data.aws_iam_policy_document.precheckin_kms_key_policy.json

  tags = {
    Name = "${local.name_prefix}-precheckin-key"
  }
}

resource "aws_kms_alias" "precheckin" {
  name          = "alias/${local.name_prefix}-precheckin"
  target_key_id = aws_kms_key.precheckin.key_id
}

data "aws_iam_policy_document" "precheckin_kms_key_policy" {
  # Required baseline statement: without it, an AWS account can lock itself
  # out of managing a KMS key entirely. Scoped to the account root only
  # (ordinary IAM policies attached to admin roles/users still govern who can
  # actually use `kms:*` under this principal, per KMS's standard model).
  statement {
    sid    = "EnableAccountRootKeyManagement"
    effect = "Allow"

    principals {
      type        = "AWS"
      identifiers = ["arn:aws:iam::${var.aws_account_id}:root"]
    }

    actions   = ["kms:*"]
    resources = ["*"]
  }

  # api task role: may encrypt and generate data keys (needed to produce the
  # per-submission DEK + ciphertext, task 8.3's envelope encryption), but
  # NEVER decrypt.
  statement {
    sid    = "AllowApiEncryptOnly"
    effect = "Allow"

    principals {
      type        = "AWS"
      identifiers = [aws_iam_role.api_task.arn]
    }

    actions = [
      "kms:GenerateDataKey",
      "kms:Encrypt",
      "kms:DescribeKey",
    ]
    resources = ["*"]
  }

  # worker task role: the ONLY role permitted to decrypt — the handoff job
  # (task 8.5) is the sole call site that ever unwraps a DEK.
  statement {
    sid    = "AllowWorkerDecryptOnly"
    effect = "Allow"

    principals {
      type        = "AWS"
      identifiers = [aws_iam_role.worker_task.arn]
    }

    actions = [
      "kms:Decrypt",
      "kms:DescribeKey",
    ]
    resources = ["*"]
  }
}
