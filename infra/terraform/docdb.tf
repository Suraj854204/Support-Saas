resource "aws_docdb_cluster_parameter_group" "main" {
  name        = "${local.name}-docdb-params"
  family      = "docdb5.0"
  description = "TLS enforced; audit logs enabled for compliance/forensics"

  parameter {
    name  = "tls"
    value = "enabled"
  }

  parameter {
    name  = "audit_logs"
    value = "enabled"
  }
}

resource "aws_docdb_subnet_group" "main" {
  name       = "${local.name}-docdb-subnets"
  subnet_ids = aws_subnet.private[*].id
}

resource "aws_security_group" "docdb" {
  name        = "${local.name}-docdb"
  description = "DocumentDB (MongoDB-compatible) — only reachable from ECS tasks"
  vpc_id      = aws_vpc.main.id

  ingress {
    description     = "MongoDB wire protocol from ECS tasks"
    from_port       = 27017
    to_port         = 27017
    protocol        = "tcp"
    security_groups = [aws_security_group.ecs_tasks.id]
  }

  egress {
    description = "All outbound traffic"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = { Name = "${local.name}-docdb-sg" }
}

resource "random_password" "docdb" {
  length  = 32
  special = false
}

resource "aws_secretsmanager_secret" "docdb_password" {
  name       = "${local.name}/docdb-password"
  kms_key_id = aws_kms_key.main.arn
}

resource "aws_secretsmanager_secret_version" "docdb_password" {
  secret_id     = aws_secretsmanager_secret.docdb_password.id
  secret_string = random_password.docdb.result
}

resource "aws_docdb_cluster" "main" {
  cluster_identifier               = "${local.name}-docdb"
  engine                           = "docdb"
  master_username                  = "saas_admin"
  master_password                  = random_password.docdb.result
  db_subnet_group_name             = aws_docdb_subnet_group.main.name
  vpc_security_group_ids           = [aws_security_group.docdb.id]
  storage_encrypted                = true
  kms_key_id                       = aws_kms_key.main.arn
  db_cluster_parameter_group_name  = aws_docdb_cluster_parameter_group.main.name
  enabled_cloudwatch_logs_exports  = ["audit"]

  backup_retention_period   = var.environment == "production" ? 7 : 1
  skip_final_snapshot       = var.environment != "production"
  final_snapshot_identifier = var.environment == "production" ? "${local.name}-docdb-final" : null
  deletion_protection       = var.environment == "production"

  tags = { Name = "${local.name}-docdb" }
}

resource "aws_docdb_cluster_instance" "main" {
  count              = var.environment == "production" ? 2 : 1
  identifier         = "${local.name}-docdb-${count.index}"
  cluster_identifier = aws_docdb_cluster.main.id
  instance_class     = var.environment == "production" ? "db.r6g.large" : "db.t4g.medium"
}
