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

resource "random_password" "ai_service_token" {
  length  = 48
  special = false
}

resource "random_password" "security_hash" {
  length  = 48
  special = false
}

# 32 random bytes, base64: the key that encrypts Gmail OAuth tokens at rest.
resource "random_id" "encryption_key" {
  byte_length = 32
}

variable "stripe_secret_key" {
  description = "Stripe secret key (leave empty to disable billing)"
  type        = string
  default     = ""
  sensitive   = true
}

variable "stripe_webhook_secret" {
  description = "Stripe webhook signing secret (whsec_...) for https://<api>/api/billing/webhook"
  type        = string
  default     = ""
  sensitive   = true
}

variable "stripe_price_starter" {
  description = "Stripe Price id (price_...) for the Starter plan"
  type        = string
  default     = ""
}

variable "stripe_price_growth" {
  description = "Stripe Price id (price_...) for the Growth plan"
  type        = string
  default     = ""
}

variable "stripe_price_enterprise" {
  description = "Stripe Price id for the Scale plan (Rs 19,999)"
  type        = string
  default     = ""
}

variable "stripe_price_overage_starter" {
  description = "Metered Stripe Price id for Starter pay-per-use AI replies"
  type        = string
  default     = ""
}

variable "stripe_price_overage_growth" {
  description = "Metered Stripe Price id for Growth pay-per-use AI replies"
  type        = string
  default     = ""
}

variable "stripe_price_overage_enterprise" {
  description = "Metered Stripe Price id for Scale pay-per-use AI replies"
  type        = string
  default     = ""
}

variable "stripe_coupon_intro" {
  description = "Stripe coupon id that makes the first Starter month Rs 9 (empty = no intro offer)"
  type        = string
  default     = ""
}

variable "stripe_tax_rate_ids" {
  description = "Comma-separated Stripe Tax Rate ids for GST (prices are exclusive of GST)"
  type        = string
  default     = ""
}

variable "cloudinary_cloud_name" {
  description = "Cloudinary cloud name for chat file sharing (empty = local disk)"
  type        = string
  default     = ""
}

variable "cloudinary_api_key" {
  description = "Cloudinary API key"
  type        = string
  default     = ""
}

variable "cloudinary_api_secret" {
  description = "Cloudinary API secret"
  type        = string
  default     = ""
  sensitive   = true
}

variable "api_public_url" {
  description = "Public https address of the API, used in file links (e.g. https://api.example.com)"
  type        = string
  default     = ""
}

variable "smtp_user" {
  description = "SMTP username for outbound mail (OTP codes, invitations, ticket notices)"
  type        = string
  default     = ""
}

variable "smtp_pass" {
  description = "SMTP password / app password"
  type        = string
  default     = ""
  sensitive   = true
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
    AI_SERVICE_TOKEN    = random_password.ai_service_token.result
    SECURITY_HASH_SECRET = random_password.security_hash.result
    ENCRYPTION_KEY      = random_id.encryption_key.b64_std
    SMTP_PASS           = var.smtp_pass
    STRIPE_SECRET_KEY     = var.stripe_secret_key
    STRIPE_WEBHOOK_SECRET = var.stripe_webhook_secret
    CLOUDINARY_API_SECRET = var.cloudinary_api_secret
    GOOGLE_API_KEY      = var.google_api_key
  })
}
