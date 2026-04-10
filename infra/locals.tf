data "aws_caller_identity" "current" {}

data "aws_partition" "current" {}

locals {
  name_prefix = "${var.project_name}-${var.environment}"

  common_tags = merge(
    {
      Project     = var.project_name
      Environment = var.environment
      ManagedBy   = "terraform"
    },
    var.tags
  )

  resume_route_enabled = trimspace(var.resume_lambda_arn) != ""
  chat_route_enabled   = trimspace(var.chat_endpoint_url) != ""
  infer_route_enabled  = trimspace(var.infer_lambda_arn) != ""
  waf_enabled          = var.enable_waf != null ? var.enable_waf : var.environment == "prod"

  turnstile_secret_arn = trimspace(var.turnstile_secret_arn) != "" ? trimspace(var.turnstile_secret_arn) : aws_secretsmanager_secret.turnstile[0].arn
  session_secret_arn   = trimspace(var.session_signing_secret_arn) != "" ? trimspace(var.session_signing_secret_arn) : aws_secretsmanager_secret.session_signing[0].arn

  cors_allowed_headers = "Content-Type,Authorization,X-Requested-With"
  cors_allowed_methods = "OPTIONS,GET,POST"
  cors_max_age         = "300"
}
