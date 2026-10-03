# RDS PostgreSQL (design: "PostgreSQL for app-owned state"). Single-AZ for
# this reference/cost-conscious default — a production deployment should
# enable `multi_az = true`.

resource "aws_db_subnet_group" "main" {
  name       = "${local.name_prefix}-db-subnet-group"
  subnet_ids = aws_subnet.private[*].id

  tags = {
    Name = "${local.name_prefix}-db-subnet-group"
  }
}

resource "aws_db_instance" "main" {
  identifier     = "${local.name_prefix}-db"
  engine         = "postgres"
  engine_version = "16"
  instance_class = var.db_instance_class

  allocated_storage     = 20
  max_allocated_storage = 100
  storage_type          = "gp3"
  storage_encrypted     = true

  db_name  = var.db_name
  username = var.db_username
  password = var.db_password
  port     = 5432

  db_subnet_group_name   = aws_db_subnet_group.main.name
  vpc_security_group_ids = [aws_security_group.rds.id]
  publicly_accessible    = false

  multi_az                  = false
  backup_retention_period   = 7
  skip_final_snapshot       = var.environment != "production"
  final_snapshot_identifier = var.environment == "production" ? "${local.name_prefix}-db-final" : null
  deletion_protection       = var.environment == "production"

  tags = {
    Name = "${local.name_prefix}-db"
  }
}

# `DATABASE_URL` is stored in Secrets Manager (never a plaintext ECS task
# environment variable) and injected into both services via the task
# definition's `secrets` field (compute.tf) — the execution role's
# `secrets_read_only` policy (secrets.tf/iam.tf) grants it access.
resource "aws_secretsmanager_secret" "database_url" {
  name                    = "${local.name_prefix}/database/url"
  description             = "Postgres connection string for both the api and worker processes' DATABASE_URL."
  recovery_window_in_days = 7

  tags = {
    Name = "${local.name_prefix}-database-url"
  }
}

resource "aws_secretsmanager_secret_version" "database_url" {
  secret_id     = aws_secretsmanager_secret.database_url.id
  secret_string = "postgres://${var.db_username}:${var.db_password}@${aws_db_instance.main.endpoint}/${var.db_name}"
}
