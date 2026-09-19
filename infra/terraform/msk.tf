resource "aws_cloudwatch_log_group" "msk" {
  count             = var.enable_msk ? 1 : 0
  name              = "/${local.name}/msk"
  retention_in_days = 30
  kms_key_id        = aws_kms_key.main.arn
}

resource "aws_msk_cluster" "main" {
  count                  = var.enable_msk ? 1 : 0
  cluster_name           = "${local.name}-kafka"
  kafka_version          = "3.7.x"
  number_of_broker_nodes = var.kafka_broker_count

  broker_node_group_info {
    instance_type   = var.kafka_broker_instance_type
    client_subnets  = aws_subnet.private[*].id
    security_groups = [aws_security_group.msk[0].id]

    storage_info {
      ebs_storage_info {
        volume_size = 100
      }
    }
  }

  encryption_info {
    encryption_in_transit {
      client_broker = "TLS"
      in_cluster    = true
    }
    encryption_at_rest_kms_key_arn = aws_kms_key.main.arn
  }

  logging_info {
    broker_logs {
      cloudwatch_logs {
        enabled   = true
        log_group = aws_cloudwatch_log_group.msk[0].name
      }
    }
  }

  tags = { Name = "${local.name}-kafka" }
}

output "msk_bootstrap_brokers_tls" {
  description = "TLS bootstrap broker string for KAFKA_BROKERS (only set when enable_msk = true)"
  value       = var.enable_msk ? try(aws_msk_cluster.main[0].bootstrap_brokers_tls, null) : null
}
