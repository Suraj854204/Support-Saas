terraform {
  required_version = ">= 1.7.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.6"
    }
    tls = {
      source  = "hashicorp/tls"
      version = "~> 4.0"
    }
  }

  # Remote state — uncomment and fill in once the bootstrap bucket/table
  # exist (see infra/terraform/README.md for the one-time bootstrap steps).
  # Using a remote backend is required before more than one person applies
  # this configuration.
  #
  # backend "s3" {
  #   bucket         = "support-saas-terraform-state"
  #   key            = "support-saas/terraform.tfstate"
  #   region         = "us-east-1"
  #   dynamodb_table = "support-saas-terraform-locks"
  #   encrypt        = true
  # }
}

provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      Project     = "support-saas"
      Environment = var.environment
      ManagedBy   = "terraform"
    }
  }
}
