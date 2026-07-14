variable "project_name" {
  description = "Project identifier used for naming resources."
  type        = string
  default     = "juliusm-site"
}

variable "environment" {
  description = "Environment name (for example: dev, prod)."
  type        = string
  default     = "dev"
}

variable "aws_region" {
  description = "AWS region for API and Lambda resources."
  type        = string
  default     = "us-west-2"
}

variable "stage_name" {
  description = "API Gateway stage name."
  type        = string
  default     = "prod"
}

variable "allowed_origins" {
  description = "Allowed origins for CORS responses."
  type        = list(string)
  default = [
    "https://juliusm.com",
    "https://www.juliusm.com",
    "http://localhost:4321",
    "http://127.0.0.1:4321"
  ]
}

variable "token_ttl_seconds" {
  description = "Issued session token TTL in seconds."
  type        = number
  default     = 600

  validation {
    condition     = var.token_ttl_seconds >= 60 && var.token_ttl_seconds <= 3600
    error_message = "token_ttl_seconds must be between 60 and 3600."
  }
}

variable "log_retention_days" {
  description = "CloudWatch log retention period for API and Lambda logs."
  type        = number
  default     = 30
}

variable "turnstile_siteverify_url" {
  description = "Cloudflare Turnstile server-side verification endpoint."
  type        = string
  default     = "https://challenges.cloudflare.com/turnstile/v0/siteverify"
}

variable "turnstile_secret_arn" {
  description = "Existing Secrets Manager ARN for Turnstile secret. Leave empty to create one."
  type        = string
  default     = ""
}

variable "session_signing_secret_arn" {
  description = "Existing Secrets Manager ARN for signing API session tokens. Leave empty to create one."
  type        = string
  default     = ""
}

variable "resume_lambda_arn" {
  description = "Existing resume-generation Lambda ARN. Leave empty to skip resume route wiring."
  type        = string
  default     = ""
}

variable "intake_sender_email" {
  description = "Verified SES sender email for consulting intake notifications. Leave empty to skip intake route wiring."
  type        = string
  default     = "no-reply@juliusm.com"
}

variable "intake_recipient_email" {
  description = "Email recipient for consulting intake notifications. Leave empty to skip intake route wiring."
  type        = string
  default     = ""
}

variable "chat_endpoint_url" {
  description = "Cloud Run URL for the Jay chatbot backend."
  type        = string
  default     = "https://jay-chatbot-406609817311.us-west1.run.app"
}

variable "chat_api_key" {
  description = "Shared secret sent as x-api-key to the Jay chatbot backend. Must be set when chat_endpoint_url is provided."
  type        = string
  sensitive   = true
  default     = ""
}

variable "infer_lambda_arn" {
  description = "Existing inference Lambda ARN. Leave empty to skip inference route wiring."
  type        = string
  default     = ""
}

variable "enable_waf" {
  description = "Whether to create the API WAF. Defaults to enabled only in prod when unset."
  type        = bool
  default     = null
  nullable    = true
}

variable "waf_global_rate_limit" {
  description = "Global WAF per-IP rate limit (5 minute window)."
  type        = number
  default     = 1000
}

variable "waf_resume_rate_limit" {
  description = "Per-IP rate limit for resume route (5 minute window)."
  type        = number
  default     = 120
}

variable "waf_chat_rate_limit" {
  description = "Per-IP rate limit for chat route (5 minute window)."
  type        = number
  default     = 300
}

variable "waf_infer_rate_limit" {
  description = "Per-IP rate limit for inference route (5 minute window)."
  type        = number
  default     = 120
}

variable "authorizer_cache_ttl_seconds" {
  description = "How long API Gateway caches authorizer results per token (0 disables caching)."
  type        = number
  default     = 300

  validation {
    condition     = var.authorizer_cache_ttl_seconds >= 0 && var.authorizer_cache_ttl_seconds <= 3600
    error_message = "authorizer_cache_ttl_seconds must be between 0 and 3600."
  }
}

variable "manage_lambda_permissions" {
  description = "Whether Terraform should create aws_lambda_permission resources for API Gateway invocation."
  type        = bool
  default     = true
}

variable "enable_custom_domain" {
  description = "Enable API Gateway custom domain mapping."
  type        = bool
  default     = false
}

variable "api_custom_domain_name" {
  description = "Custom domain name for API Gateway (for example: api.juliusm.com)."
  type        = string
  default     = "api.juliusm.com"
}

variable "api_certificate_arn" {
  description = "Issued ACM certificate ARN for API custom domain (regional certificate in same region)."
  type        = string
  default     = ""

  validation {
    condition     = var.enable_custom_domain == false || trimspace(var.api_certificate_arn) != ""
    error_message = "api_certificate_arn must be set when enable_custom_domain is true."
  }
}

variable "cloudflare_zone_id" {
  description = "Cloudflare zone ID for the site domain. Required when tunnel or SES management is enabled."
  type        = string
  default     = ""
}

variable "cloudflare_zone_name" {
  description = "Domain managed in the Cloudflare zone; also used as the SES domain identity."
  type        = string
  default     = "juliusm.com"
}

variable "cloudflare_account_id" {
  description = "Cloudflare account ID that owns the remotely managed tunnel."
  type        = string
  default     = ""
}

variable "enable_cloudflare_tunnel" {
  description = "Whether Terraform should create the remote-managed Cloudflare Tunnel, ingress policy, and DNS."
  type        = bool
  default     = false
}

variable "cloudflare_tunnel_name" {
  description = "Name of the remotely managed tunnel used by the Arch ingress node."
  type        = string
  default     = "meristem-arch-ingress"
}

variable "mcp_public_hostname" {
  description = "Public hostname for the Meristem MCP provider edge."
  type        = string
  default     = "mcp.juliusm.com"
}

variable "mcp_origin_url" {
  description = "Loopback HTTP origin served by the streaming-safe Meristem edge limiter on the Arch ingress node."
  type        = string
  default     = "http://127.0.0.1:8081"

  validation {
    condition     = can(regex("^http://(127\\.0\\.0\\.1|localhost|\\[::1\\])(:[0-9]+)?$", var.mcp_origin_url))
    error_message = "mcp_origin_url must be a loopback HTTP origin without a path."
  }
}

variable "cloudflare_additional_tunnel_routes" {
  description = "Additional hostname-to-loopback-origin routes. Keep empty until a service and its security contract exist."
  type        = map(string)
  default     = {}

  validation {
    condition = alltrue([
      for service in values(var.cloudflare_additional_tunnel_routes) :
      can(regex("^http://(127\\.0\\.0\\.1|localhost|\\[::1\\])(:[0-9]+)?$", service))
    ])
    error_message = "Every additional tunnel route must target a loopback HTTP origin without a path."
  }
}

variable "enable_cloudflare_rate_limits" {
  description = "Whether to own the zone http_ratelimit ruleset for the MCP OAuth endpoints. Import an existing phase ruleset before enabling."
  type        = bool
  default     = false
}

variable "enable_ses_domain_identity" {
  description = "Whether to create the SES domain identity and publish its Easy DKIM records in Cloudflare."
  type        = bool
  default     = false
}

variable "ses_domain" {
  description = "Domain to validate with SES."
  type        = string
  default     = "juliusm.com"
}

variable "tags" {
  description = "Additional tags applied to resources."
  type        = map(string)
  default     = {}
}
