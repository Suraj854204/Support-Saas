output "alb_dns_name" {
  description = "The ALB's public DNS name (use this if domain_name is not set)"
  value       = aws_lb.main.dns_name
}

output "app_url" {
  description = "The public URL for the application"
  value       = var.domain_name != "" ? "https://${var.domain_name}" : "http://${aws_lb.main.dns_name}"
}

output "ecs_cluster_name" {
  value = aws_ecs_cluster.main.name
}

output "ecr_repository_urls" {
  value = {
    web        = aws_ecr_repository.web.repository_url
    api        = aws_ecr_repository.api.repository_url
    ai_service = aws_ecr_repository.ai_service.repository_url
  }
}

output "rds_endpoint" {
  value     = aws_db_instance.main.endpoint
  sensitive = true
}

output "docdb_endpoint" {
  value     = aws_docdb_cluster.main.endpoint
  sensitive = true
}

output "redis_endpoint" {
  value     = aws_elasticache_replication_group.main.primary_endpoint_address
  sensitive = true
}

output "opensearch_endpoint" {
  value = aws_opensearch_domain.main.endpoint
}

output "vpc_id" {
  value = aws_vpc.main.id
}

output "private_subnet_ids" {
  value = aws_subnet.private[*].id
}
