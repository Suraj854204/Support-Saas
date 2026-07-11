resource "aws_ecs_cluster" "main" {
  name = local.name

  setting {
    name  = "containerInsights"
    value = "enabled"
  }
}

resource "aws_ecs_cluster_capacity_providers" "main" {
  cluster_name       = aws_ecs_cluster.main.name
  capacity_providers = ["FARGATE", "FARGATE_SPOT"]

  default_capacity_provider_strategy {
    capacity_provider = var.environment == "production" ? "FARGATE" : "FARGATE_SPOT"
    weight            = 100
  }
}

resource "aws_cloudwatch_log_group" "web" {
  name              = "/${local.name}/web"
  retention_in_days = 30
}
resource "aws_cloudwatch_log_group" "api" {
  name              = "/${local.name}/api"
  retention_in_days = 30
}
resource "aws_cloudwatch_log_group" "ai_service" {
  name              = "/${local.name}/ai-service"
  retention_in_days = 30
}
resource "aws_cloudwatch_log_group" "qdrant" {
  name              = "/${local.name}/qdrant"
  retention_in_days = 14
}

data "aws_caller_identity" "current" {}

locals {
  account_id = data.aws_caller_identity.current.account_id
  ecr_uri    = "${local.account_id}.dkr.ecr.${var.aws_region}.amazonaws.com"
}

# ---------------------------------------------------------------------------
# Qdrant — internal-only, no ALB, reached via Cloud Map DNS. Fargate has no
# persistent local disk, so its storage directory is an EFS mount.
# ---------------------------------------------------------------------------
resource "aws_ecs_task_definition" "qdrant" {
  family                   = "${local.name}-qdrant"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = "512"
  memory                   = "1024"
  execution_role_arn       = aws_iam_role.ecs_execution.arn
  task_role_arn            = aws_iam_role.ecs_task.arn

  volume {
    name = "qdrant-storage"
    efs_volume_configuration {
      file_system_id     = aws_efs_file_system.qdrant.id
      transit_encryption = "ENABLED"
      authorization_config {
        access_point_id = aws_efs_access_point.qdrant.id
        iam             = "ENABLED"
      }
    }
  }

  container_definitions = jsonencode([
    {
      name         = "qdrant"
      image        = "qdrant/qdrant:v1.12.4"
      essential    = true
      portMappings = [{ containerPort = 6333, protocol = "tcp" }]
      mountPoints  = [{ sourceVolume = "qdrant-storage", containerPath = "/qdrant/storage" }]
      logConfiguration = {
        logDriver = "awslogs"
        options = {
          "awslogs-group"         = aws_cloudwatch_log_group.qdrant.name
          "awslogs-region"        = var.aws_region
          "awslogs-stream-prefix" = "qdrant"
        }
      }
    }
  ])
}

resource "aws_ecs_service" "qdrant" {
  name            = "${local.name}-qdrant"
  cluster         = aws_ecs_cluster.main.id
  task_definition = aws_ecs_task_definition.qdrant.arn
  desired_count   = 1
  launch_type     = "FARGATE"

  network_configuration {
    subnets         = aws_subnet.private[*].id
    security_groups = [aws_security_group.ecs_tasks.id]
  }

  service_registries {
    registry_arn = aws_service_discovery_service.qdrant.arn
  }
}

# ---------------------------------------------------------------------------
# API
# ---------------------------------------------------------------------------
resource "aws_ecs_task_definition" "api" {
  family                   = "${local.name}-api"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = "512"
  memory                   = "1024"
  execution_role_arn       = aws_iam_role.ecs_execution.arn
  task_role_arn            = aws_iam_role.ecs_task.arn

  container_definitions = jsonencode([
    {
      name         = "api"
      image        = "${local.ecr_uri}/${aws_ecr_repository.api.name}:${var.container_image_tag}"
      essential    = true
      portMappings = [{ containerPort = 4000, protocol = "tcp" }]
      environment = [
        { name = "NODE_ENV", value = "production" },
        { name = "API_PORT", value = "4000" },
        { name = "QDRANT_URL", value = local.qdrant_url },
        { name = "AI_SERVICE_URL", value = "http://${aws_lb.main.dns_name}/ai" },
        { name = "NEXT_PUBLIC_APP_URL", value = var.domain_name != "" ? "https://${var.domain_name}" : "http://${aws_lb.main.dns_name}" },
        { name = "KAFKA_ENABLED", value = tostring(var.enable_msk) },
        { name = "KAFKA_BROKERS", value = var.enable_msk ? try(aws_msk_cluster.main[0].bootstrap_brokers_tls, "") : "" },
        { name = "ELASTICSEARCH_URL", value = "https://${aws_opensearch_domain.main.endpoint}" },
      ]
      secrets = [
        { name = "DATABASE_URL", valueFrom = aws_secretsmanager_secret.database_url.arn },
        { name = "MONGO_URL", valueFrom = aws_secretsmanager_secret.mongo_url.arn },
        { name = "REDIS_URL", valueFrom = aws_secretsmanager_secret.redis_url.arn },
        { name = "JWT_ACCESS_SECRET", valueFrom = "${aws_secretsmanager_secret.app_secrets.arn}:JWT_ACCESS_SECRET::" },
        { name = "JWT_REFRESH_SECRET", valueFrom = "${aws_secretsmanager_secret.app_secrets.arn}:JWT_REFRESH_SECRET::" },
        { name = "WIDGET_JWT_SECRET", valueFrom = "${aws_secretsmanager_secret.app_secrets.arn}:WIDGET_JWT_SECRET::" },
      ]
      logConfiguration = {
        logDriver = "awslogs"
        options = {
          "awslogs-group"         = aws_cloudwatch_log_group.api.name
          "awslogs-region"        = var.aws_region
          "awslogs-stream-prefix" = "api"
        }
      }
    }
  ])
}

resource "aws_ecs_service" "api" {
  name            = "${local.name}-api"
  cluster         = aws_ecs_cluster.main.id
  task_definition = aws_ecs_task_definition.api.arn
  desired_count   = var.api_desired_count
  launch_type     = "FARGATE"

  network_configuration {
    subnets         = aws_subnet.private[*].id
    security_groups = [aws_security_group.ecs_tasks.id]
  }

  load_balancer {
    target_group_arn = aws_lb_target_group.api.arn
    container_name   = "api"
    container_port   = 4000
  }

  depends_on = [aws_lb_listener.http]
}

# ---------------------------------------------------------------------------
# AI service
# ---------------------------------------------------------------------------
resource "aws_ecs_task_definition" "ai_service" {
  family                   = "${local.name}-ai-service"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = "1024"
  memory                   = "2048"
  execution_role_arn       = aws_iam_role.ecs_execution.arn
  task_role_arn            = aws_iam_role.ecs_task.arn

  container_definitions = jsonencode([
    {
      name         = "ai-service"
      image        = "${local.ecr_uri}/${aws_ecr_repository.ai_service.name}:${var.container_image_tag}"
      essential    = true
      portMappings = [{ containerPort = 8000, protocol = "tcp" }]
      environment = [
        { name = "ENVIRONMENT", value = "production" },
        { name = "QDRANT_URL", value = local.qdrant_url },
        { name = "GEMINI_CHAT_MODEL", value = "gemini-2.5-flash" },
        { name = "GEMINI_EMBEDDING_MODEL", value = "models/text-embedding-004" },
        { name = "QDRANT_VECTOR_SIZE", value = "768" },
        { name = "CORS_ORIGINS", value = var.domain_name != "" ? "https://${var.domain_name}" : "http://${aws_lb.main.dns_name}" },
      ]
      secrets = [
        { name = "GOOGLE_API_KEY", valueFrom = "${aws_secretsmanager_secret.app_secrets.arn}:GOOGLE_API_KEY::" },
      ]
      logConfiguration = {
        logDriver = "awslogs"
        options = {
          "awslogs-group"         = aws_cloudwatch_log_group.ai_service.name
          "awslogs-region"        = var.aws_region
          "awslogs-stream-prefix" = "ai-service"
        }
      }
    }
  ])
}

resource "aws_ecs_service" "ai_service" {
  name            = "${local.name}-ai-service"
  cluster         = aws_ecs_cluster.main.id
  task_definition = aws_ecs_task_definition.ai_service.arn
  desired_count   = var.ai_service_desired_count
  launch_type     = "FARGATE"

  network_configuration {
    subnets         = aws_subnet.private[*].id
    security_groups = [aws_security_group.ecs_tasks.id]
  }

  load_balancer {
    target_group_arn = aws_lb_target_group.ai_service.arn
    container_name   = "ai-service"
    container_port   = 8000
  }

  depends_on = [aws_lb_listener.http]
}

# ---------------------------------------------------------------------------
# Web
# ---------------------------------------------------------------------------
resource "aws_ecs_task_definition" "web" {
  family                   = "${local.name}-web"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = "512"
  memory                   = "1024"
  execution_role_arn       = aws_iam_role.ecs_execution.arn
  task_role_arn            = aws_iam_role.ecs_task.arn

  container_definitions = jsonencode([
    {
      name         = "web"
      image        = "${local.ecr_uri}/${aws_ecr_repository.web.name}:${var.container_image_tag}"
      essential    = true
      portMappings = [{ containerPort = 3000, protocol = "tcp" }]
      environment = [
        { name = "NODE_ENV", value = "production" },
        {
          name  = "NEXT_PUBLIC_API_URL"
          value = var.domain_name != "" ? "https://${var.domain_name}" : "http://${aws_lb.main.dns_name}"
        },
        {
          name  = "NEXT_PUBLIC_AI_URL"
          value = var.domain_name != "" ? "https://${var.domain_name}/ai" : "http://${aws_lb.main.dns_name}/ai"
        },
      ]
      logConfiguration = {
        logDriver = "awslogs"
        options = {
          "awslogs-group"         = aws_cloudwatch_log_group.web.name
          "awslogs-region"        = var.aws_region
          "awslogs-stream-prefix" = "web"
        }
      }
    }
  ])
}

resource "aws_ecs_service" "web" {
  name            = "${local.name}-web"
  cluster         = aws_ecs_cluster.main.id
  task_definition = aws_ecs_task_definition.web.arn
  desired_count   = var.web_desired_count
  launch_type     = "FARGATE"

  network_configuration {
    subnets         = aws_subnet.private[*].id
    security_groups = [aws_security_group.ecs_tasks.id]
  }

  load_balancer {
    target_group_arn = aws_lb_target_group.web.arn
    container_name   = "web"
    container_port   = 3000
  }

  depends_on = [aws_lb_listener.http]
}
