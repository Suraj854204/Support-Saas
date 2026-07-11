variable "aws_region" {
  description = "AWS region to deploy into"
  type        = string
  default     = "us-east-1"
}

variable "environment" {
  description = "Deployment environment name (dev, staging, production)"
  type        = string
  default     = "production"

  validation {
    condition     = contains(["dev", "staging", "production"], var.environment)
    error_message = "environment must be one of: dev, staging, production."
  }
}

variable "project_name" {
  description = "Short project name used as a prefix for resource names"
  type        = string
  default     = "support-saas"
}

variable "vpc_cidr" {
  description = "CIDR block for the VPC"
  type        = string
  default     = "10.20.0.0/16"
}

variable "availability_zones" {
  description = "Availability zones to spread subnets across (2 minimum for RDS Multi-AZ)"
  type        = list(string)
  default     = ["us-east-1a", "us-east-1b"]
}

# --- Database ---

variable "db_instance_class" {
  description = "RDS instance class"
  type        = string
  default     = "db.t4g.medium"
}

variable "db_name" {
  description = "Postgres database name"
  type        = string
  default     = "support_saas"
}

variable "db_username" {
  description = "Postgres master username"
  type        = string
  default     = "saas_admin"
  sensitive   = true
}

variable "db_allocated_storage_gb" {
  description = "RDS allocated storage in GB"
  type        = number
  default     = 50
}

variable "db_multi_az" {
  description = "Whether to enable RDS Multi-AZ (recommended for production)"
  type        = bool
  default     = true
}

# --- Cache ---

variable "redis_node_type" {
  description = "ElastiCache Redis node type"
  type        = string
  default     = "cache.t4g.small"
}

# --- Search ---

variable "opensearch_instance_type" {
  description = "OpenSearch (Elasticsearch-compatible) data node instance type"
  type        = string
  default     = "t3.small.search"
}

# --- Kafka (MSK) ---

variable "enable_msk" {
  description = "Provision a managed Kafka (MSK) cluster. Disable for smaller/dev environments and point KAFKA_BROKERS at a self-hosted broker instead."
  type        = bool
  default     = true
}

variable "kafka_broker_instance_type" {
  description = "MSK broker instance type"
  type        = string
  default     = "kafka.t3.small"
}

variable "kafka_broker_count" {
  description = "Number of MSK brokers (must be a multiple of the number of AZs)"
  type        = number
  default     = 2
}

# --- ECS / containers ---

variable "container_image_tag" {
  description = "Docker image tag to deploy for all services (set by CI to the commit SHA)"
  type        = string
  default     = "latest"
}

variable "api_desired_count" {
  description = "Desired number of API task replicas"
  type        = number
  default     = 2
}

variable "web_desired_count" {
  description = "Desired number of web task replicas"
  type        = number
  default     = 2
}

variable "ai_service_desired_count" {
  description = "Desired number of AI service task replicas"
  type        = number
  default     = 2
}

# --- DNS / TLS ---

variable "domain_name" {
  description = "Root domain name (e.g. example.com). Leave empty to skip Route53/ACM and expose the ALB's default DNS name."
  type        = string
  default     = ""
}
