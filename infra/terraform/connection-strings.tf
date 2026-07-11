locals {
  database_url = "postgresql://${var.db_username}:${random_password.db.result}@${aws_db_instance.main.endpoint}/${var.db_name}"
  # DocumentDB enforces TLS (see docdb.tf) — the AWS CA bundle must be
  # available to the API container; see infra/terraform/README.md for the
  # one-line addition to the ECS task's Dockerfile/entrypoint.
  mongo_url  = "mongodb://saas_admin:${random_password.docdb.result}@${aws_docdb_cluster.main.endpoint}:27017/support_saas_docs?tls=true&tlsCAFile=global-bundle.pem&retryWrites=false"
  redis_url  = "rediss://:${random_password.redis_auth.result}@${aws_elasticache_replication_group.main.primary_endpoint_address}:6379"
  qdrant_url = "http://qdrant.${var.project_name}.local:6333"
}

resource "aws_secretsmanager_secret" "database_url" {
  name       = "${local.name}/database-url"
  kms_key_id = aws_kms_key.main.arn
}
resource "aws_secretsmanager_secret_version" "database_url" {
  secret_id     = aws_secretsmanager_secret.database_url.id
  secret_string = local.database_url
}

resource "aws_secretsmanager_secret" "mongo_url" {
  name       = "${local.name}/mongo-url"
  kms_key_id = aws_kms_key.main.arn
}
resource "aws_secretsmanager_secret_version" "mongo_url" {
  secret_id     = aws_secretsmanager_secret.mongo_url.id
  secret_string = local.mongo_url
}

resource "aws_secretsmanager_secret" "redis_url" {
  name       = "${local.name}/redis-url"
  kms_key_id = aws_kms_key.main.arn
}
resource "aws_secretsmanager_secret_version" "redis_url" {
  secret_id     = aws_secretsmanager_secret.redis_url.id
  secret_string = local.redis_url
}
