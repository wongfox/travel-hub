# Secrets Manager containers for adapter credentials (design Decision 6: each
# external port's real adapter needs credentials once chosen) and the
# self-managed VAPID keys (design Decision 11). Every secret is created EMPTY
# (no `aws_secretsmanager_secret_version` resource) — no real credentials are
# invented or committed here; populate each value out-of-band (console, CLI,
# or a separate, access-controlled process) once that integration is chosen.

locals {
  adapter_secret_names = [
    "payment-gateway",   # PaymentGatewayPort (design Decision 8)
    "e-receipt",         # EReceiptPort (design Decision 8)
    "sir-pos",           # SirPosPort (design's booking-data-integration)
    "wifi-entitlement",  # WifiEntitlementPort (design Decision 9)
    "content-cms",       # ContentPort (design Decision 10)
    "staff-alert",       # StaffAlertPort (design Decision 12, D4a)
    "precheckin-handoff" # PrecheckinHandoffPort (design's pre-check-in handoff)
  ]
}

resource "aws_secretsmanager_secret" "adapter_credentials" {
  for_each = toset(local.adapter_secret_names)

  name                    = "${local.name_prefix}/adapters/${each.key}"
  description             = "Credentials for the ${each.key} adapter (design Decision 6). Populated out-of-band; this resource only reserves the secret container."
  recovery_window_in_days = 7

  tags = {
    Name = "${local.name_prefix}-adapter-${each.key}"
  }
}

resource "aws_secretsmanager_secret" "push_vapid_keys" {
  name                    = "${local.name_prefix}/push/vapid-keys"
  description             = "Self-managed VAPID key pair for Web Push (design Decision 11: PUSH_VAPID_PUBLIC_KEY / PUSH_VAPID_PRIVATE_KEY). Populated out-of-band; this resource only reserves the secret container."
  recovery_window_in_days = 7

  tags = {
    Name = "${local.name_prefix}-push-vapid-keys"
  }
}

resource "aws_secretsmanager_secret" "analytics_trip_hash_secret" {
  name                    = "${local.name_prefix}/analytics/trip-hash-secret"
  description             = "HMAC secret for trip_hash pseudonymization (design Data Model, env.ts's ANALYTICS_TRIP_HASH_SECRET). Populated out-of-band."
  recovery_window_in_days = 7

  tags = {
    Name = "${local.name_prefix}-analytics-trip-hash-secret"
  }
}

data "aws_iam_policy_document" "secrets_read_only" {
  statement {
    effect  = "Allow"
    actions = ["secretsmanager:GetSecretValue"]
    resources = concat(
      [for secret in aws_secretsmanager_secret.adapter_credentials : secret.arn],
      [
        aws_secretsmanager_secret.push_vapid_keys.arn,
        aws_secretsmanager_secret.analytics_trip_hash_secret.arn,
        aws_secretsmanager_secret.database_url.arn,
      ],
    )
  }
}
