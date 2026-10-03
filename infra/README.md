# Travel Hub — AWS Reference IaC (task 13.2)

Terraform configuration for the AWS reference deployment described in
`sdd/travel-hub-mvp/design`'s Decision 3: CloudFront (S3 static + `/api/*` to
the BFF), ECS Fargate for the `api`/`worker` processes, RDS PostgreSQL, a
dedicated S3 bucket + dedicated KMS key for pre-check-in objects, and Secrets
Manager for adapter credentials/VAPID keys.

This is a reference deployment, not a production-hardened one: a single NAT
gateway, single-AZ RDS, and no HTTPS certificate wiring (CloudFront's default
certificate only) are all documented simplifications — see each resource's
own comments.

## Running `terraform validate` (no AWS account needed)

```sh
cd infra
terraform init -backend=false
terraform validate
```

`validate` only checks syntax and internal consistency; it makes no AWS API
calls, so this works with zero configuration.

## Running `terraform plan` without real AWS credentials

The default `mock_credentials = true` (see `variables.tf`) makes the AWS
provider use dummy credentials and skip every credential/account-lookup API
call. Combined with this configuration deliberately avoiding any `data`
source that requires a live AWS API call (no `aws_ami`, no
`aws_caller_identity` — `var.aws_account_id` is a placeholder variable
instead), `terraform plan` can render a full plan with no real AWS account:

```sh
cd infra
terraform init -backend=false
terraform plan
```

This will not reach AWS at all. It validates that every resource/attribute
reference in this configuration is internally consistent and renders the
full set of resources that would be created.

### Planning against LocalStack instead

For a plan that actually talks to a mocked AWS API surface (useful for
catching provider-level validation LocalStack enforces that pure offline
`plan` cannot), run [LocalStack](https://www.localstack.cloud/) locally and
point the provider at it:

```sh
docker run -d -p 4566:4566 localstack/localstack
cd infra
terraform init -backend=false
terraform plan -var="localstack_endpoint=http://localhost:4566"
```

### Planning against a real AWS account

Set `mock_credentials = false`, supply real credentials via the AWS
provider's normal mechanisms (env vars, a shared credentials file, SSO —
never inline in this repository), and supply real values for
`aws_account_id`, `db_password`, and the container image URIs (see
`terraform.tfvars.example`):

```sh
cd infra
cp terraform.tfvars.example terraform.tfvars  # then edit it; it's gitignored
terraform init
terraform plan -var="mock_credentials=false" -var-file=terraform.tfvars
```

## Verifying the KMS decrypt restriction (task 13.2's acceptance criterion)

```sh
terraform plan -out=tfplan
terraform show -json tfplan | jq '.resource_changes[] | select(.address=="aws_kms_key.precheckin")'
```

The rendered `policy` document's `AllowWorkerDecryptOnly` statement
(`kms.tf`) grants `kms:Decrypt`/`kms:DescribeKey` only to
`aws_iam_role.worker_task`'s ARN; the `AllowApiEncryptOnly` statement grants
the `api` task role `GenerateDataKey`/`Encrypt`/`DescribeKey` only — never
`Decrypt`.

## Secrets

Every `aws_secretsmanager_secret` this configuration creates (adapter
credentials, VAPID keys, the analytics trip-hash secret) is created EMPTY —
no `aws_secretsmanager_secret_version` populates a real value, except
`database_url`, which is derived from `var.db_password` (supplied by the
operator, never hardcoded) and the provisioned RDS endpoint. Populate every
other secret's real value out-of-band once that integration is chosen.

## Feature flags

`var.feature_flag_overrides` (default empty) sets the `FEATURE_FLAG_OVERRIDES`
env var on both the api and worker task definitions: a JSON object of known
flag keys to booleans, e.g. `{"wifi.checkout":true}` (precedence:
`FLAG_DEFAULTS` < overrides, see `services/bff/src/config/flags.ts`). Plain
config, never secrets. Unknown keys or malformed JSON fail the task at boot,
and a guarded flag still fails boot unless its go-live prerequisites are met
(`services/bff/src/config/go-live-guards.ts`), so enabling one in
production/staging also requires the matching non-stub `ADAPTER_*` values.
