# One shared CMK for this project's data-at-rest encryption. A single
# app-tier key (rather than one per service) keeps IAM/key-policy management
# tractable while still satisfying "encrypted with a customer-managed key"
# requirements across Secrets Manager, ECR, CloudWatch Logs, EFS, RDS, and
# ElastiCache. Split into per-service keys later if compliance requires it.

resource "aws_kms_key" "main" {
  description             = "${local.name} — shared app-tier encryption key"
  deletion_window_in_days = 30
  enable_key_rotation     = true

  tags = { Name = "${local.name}-kms" }
}

resource "aws_kms_alias" "main" {
  name          = "alias/${local.name}"
  target_key_id = aws_kms_key.main.key_id
}
