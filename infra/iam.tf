# --- ECS task execution role (pulls container images, writes to CloudWatch
# Logs via the `awslogs` log driver) — shared by both services; this is
# infrastructure plumbing, not an application-data permission. ---

data "aws_iam_policy_document" "ecs_tasks_assume_role" {
  statement {
    effect = "Allow"

    principals {
      type        = "Service"
      identifiers = ["ecs-tasks.amazonaws.com"]
    }

    actions = ["sts:AssumeRole"]
  }
}

resource "aws_iam_role" "ecs_task_execution" {
  name               = "${local.name_prefix}-ecs-task-execution"
  assume_role_policy = data.aws_iam_policy_document.ecs_tasks_assume_role.json
}

resource "aws_iam_role_policy_attachment" "ecs_task_execution_managed" {
  role       = aws_iam_role.ecs_task_execution.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

# Task execution role additionally needs read access to the adapter-secrets
# (secrets.tf) so ECS can inject them as container secrets at task start.
resource "aws_iam_role_policy" "ecs_task_execution_secrets" {
  name   = "${local.name_prefix}-ecs-task-execution-secrets"
  role   = aws_iam_role.ecs_task_execution.id
  policy = data.aws_iam_policy_document.secrets_read_only.json
}

# --- api task role: application-level permissions for the `api` process. ---

resource "aws_iam_role" "api_task" {
  name               = "${local.name_prefix}-api-task"
  assume_role_policy = data.aws_iam_policy_document.ecs_tasks_assume_role.json
}

# api may put objects into the precheckin bucket (task 8.3's upload path) and
# encrypt via KMS (granted separately in kms.tf's key policy) — never read,
# list, or delete; never decrypt.
data "aws_iam_policy_document" "api_precheckin_bucket_access" {
  statement {
    effect    = "Allow"
    actions   = ["s3:PutObject"]
    resources = ["${aws_s3_bucket.precheckin.arn}/*"]
  }
}

resource "aws_iam_role_policy" "api_precheckin_bucket" {
  name   = "${local.name_prefix}-api-precheckin-bucket"
  role   = aws_iam_role.api_task.id
  policy = data.aws_iam_policy_document.api_precheckin_bucket_access.json
}

# --- worker task role: application-level permissions for the `worker`
# process. ---

resource "aws_iam_role" "worker_task" {
  name               = "${local.name_prefix}-worker-task"
  assume_role_policy = data.aws_iam_policy_document.ecs_tasks_assume_role.json
}

# worker may read and delete precheckin objects (the handoff job reads them
# to deliver downstream; the purge job deletes them, task 8.5) — never put a
# new object (that stays the api role's job only).
data "aws_iam_policy_document" "worker_precheckin_bucket_access" {
  statement {
    effect    = "Allow"
    actions   = ["s3:GetObject", "s3:DeleteObject"]
    resources = ["${aws_s3_bucket.precheckin.arn}/*"]
  }
}

resource "aws_iam_role_policy" "worker_precheckin_bucket" {
  name   = "${local.name_prefix}-worker-precheckin-bucket"
  role   = aws_iam_role.worker_task.id
  policy = data.aws_iam_policy_document.worker_precheckin_bucket_access.json
}
