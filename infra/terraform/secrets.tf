variable "google_api_key" {
  description = "Google Gemini API key for the AI service (get one at https://aistudio.google.com/apikey)"
  type        = string
  default     = ""
  sensitive   = true
}

resource "random_password" "jwt_access" {
  length  = 48
  special = false
}

resource "random_password" "jwt_refresh" {
  length  = 48
  special = false
}

resource "random_password" "widget_jwt" {
  length  = 48
  special = false
}

resource "aws_secretsmanager_secret" "app_secrets" {
  name       = "${local.name}/app-secrets"
  kms_key_id = aws_kms_key.main.arn
}

resource "aws_secretsmanager_secret_version" "app_secrets" {
  secret_id = aws_secretsmanager_secret.app_secrets.id
  secret_string = jsonencode({
    JWT_ACCESS_SECRET   = random_password.jwt_access.result
    JWT_REFRESH_SECRET  = random_password.jwt_refresh.result
    WIDGET_JWT_SECRET   = random_password.widget_jwt.result
    GOOGLE_API_KEY      = var.google_api_key
  })
}
