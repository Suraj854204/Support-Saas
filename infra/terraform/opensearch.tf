resource "random_password" "opensearch_master" {
  length = 24
}

resource "aws_secretsmanager_secret" "opensearch_master" {
  name       = "${local.name}/opensearch-master-password"
  kms_key_id = aws_kms_key.main.arn
}

resource "aws_secretsmanager_secret_version" "opensearch_master" {
  secret_id     = aws_secretsmanager_secret.opensearch_master.id
  secret_string = random_password.opensearch_master.result
}

resource "aws_cloudwatch_log_group" "opensearch" {
  name              = "/${local.name}/opensearch"
  retention_in_days = 30
  kms_key_id        = aws_kms_key.main.arn
}

# OpenSearch needs an explicit resource policy granting it permission to
# write into this specific log group before log publishing will work.
data "aws_iam_policy_document" "opensearch_logs" {
  statement {
    effect  = "Allow"
    actions = ["logs:PutLogEvents", "logs:CreateLogStream"]
    resources = ["${aws_cloudwatch_log_group.opensearch.arn}:*"]
    principals {
      type        = "Service"
      identifiers = ["es.amazonaws.com"]
    }
  }
}

resource "aws_cloudwatch_log_resource_policy" "opensearch" {
  policy_name     = "${local.name}-opensearch-logs"
  policy_document = data.aws_iam_policy_document.opensearch_logs.json
}

resource "aws_opensearch_domain" "main" {
  domain_name    = "${local.name}-search"
  engine_version = "OpenSearch_2.15"

  cluster_config {
    instance_type          = var.opensearch_instance_type
    instance_count         = var.environment == "production" ? 2 : 1
    zone_awareness_enabled = var.environment == "production"

    dedicated_master_enabled = var.environment == "production"
    dedicated_master_type    = var.environment == "production" ? "t3.small.search" : null
    dedicated_master_count   = var.environment == "production" ? 3 : null

    dynamic "zone_awareness_config" {
      for_each = var.environment == "production" ? [1] : []
      content {
        availability_zone_count = 2
      }
    }
  }

  ebs_options {
    ebs_enabled = true
    volume_type = "gp3"
    volume_size = 20
  }

  vpc_options {
    subnet_ids         = var.environment == "production" ? aws_subnet.private[*].id : [aws_subnet.private[0].id]
    security_group_ids = [aws_security_group.opensearch.id]
  }

  advanced_security_options {
    enabled                        = true
    internal_user_database_enabled = true
    master_user_options {
      master_user_name     = "admin"
      master_user_password = random_password.opensearch_master.result
    }
  }

  encrypt_at_rest {
    enabled    = true
    kms_key_id = aws_kms_key.main.arn
  }

  node_to_node_encryption {
    enabled = true
  }

  domain_endpoint_options {
    enforce_https       = true
    tls_security_policy = "Policy-Min-TLS-1-2-2019-07"
  }

  log_publishing_options {
    cloudwatch_log_group_arn = aws_cloudwatch_log_group.opensearch.arn
    log_type                 = "AUDIT_LOGS"
  }

  log_publishing_options {
    cloudwatch_log_group_arn = aws_cloudwatch_log_group.opensearch.arn
    log_type                 = "ES_APPLICATION_LOGS"
  }

  tags = { Name = "${local.name}-opensearch" }

  depends_on = [aws_cloudwatch_log_resource_policy.opensearch]
}
