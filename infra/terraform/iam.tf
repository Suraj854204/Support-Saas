data "aws_iam_policy_document" "ecs_assume_role" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["ecs-tasks.amazonaws.com"]
    }
  }
}

# --- Execution role: used by the ECS agent to pull images and write logs ---
resource "aws_iam_role" "ecs_execution" {
  name               = "${local.name}-ecs-execution"
  assume_role_policy = data.aws_iam_policy_document.ecs_assume_role.json
}

resource "aws_iam_role_policy_attachment" "ecs_execution_managed" {
  role       = aws_iam_role.ecs_execution.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

# The execution role also needs to read the Secrets Manager secrets that
# task definitions reference for DATABASE_URL/REDIS_URL/etc at container
# startup (this is how ECS injects secrets without baking them into images).
data "aws_iam_policy_document" "ecs_execution_secrets" {
  statement {
    actions   = ["secretsmanager:GetSecretValue"]
    resources = [
      aws_secretsmanager_secret.db_password.arn,
      aws_secretsmanager_secret.redis_auth.arn,
      aws_secretsmanager_secret.docdb_password.arn,
      aws_secretsmanager_secret.opensearch_master.arn,
      aws_secretsmanager_secret.app_secrets.arn,
      aws_secretsmanager_secret.database_url.arn,
      aws_secretsmanager_secret.mongo_url.arn,
      aws_secretsmanager_secret.redis_url.arn,
    ]
  }
}

resource "aws_iam_role_policy" "ecs_execution_secrets" {
  name   = "${local.name}-ecs-execution-secrets"
  role   = aws_iam_role.ecs_execution.id
  policy = data.aws_iam_policy_document.ecs_execution_secrets.json
}

# --- Task role: the application's own runtime AWS permissions ---
resource "aws_iam_role" "ecs_task" {
  name               = "${local.name}-ecs-task"
  assume_role_policy = data.aws_iam_policy_document.ecs_assume_role.json
}

# Minimal by default — extend here if the app later needs S3 (attachments),
# SES (transactional email), etc. Kept least-privilege on purpose.
data "aws_iam_policy_document" "ecs_task_runtime" {
  statement {
    sid       = "CloudWatchLogs"
    actions   = ["logs:CreateLogStream", "logs:PutLogEvents"]
    resources = ["arn:aws:logs:${var.aws_region}:*:log-group:/${local.name}/*"]
  }
}

resource "aws_iam_role_policy" "ecs_task_runtime" {
  name   = "${local.name}-ecs-task-runtime"
  role   = aws_iam_role.ecs_task.id
  policy = data.aws_iam_policy_document.ecs_task_runtime.json
}
