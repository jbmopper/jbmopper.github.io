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
  default     = "us-east-1"
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

variable "chat_lambda_arn" {
  description = "Existing chatbot Lambda ARN. Leave empty to skip chat route wiring."
  type        = string
  default     = ""
}

variable "infer_lambda_arn" {
  description = "Existing inference Lambda ARN. Leave empty to optionally use Modal proxy Lambda."
  type        = string
  default     = ""
}

variable "enable_modal_inference_proxy" {
  description = "If true and infer_lambda_arn is empty, deploy a Modal inference proxy Lambda."
  type        = bool
  default     = false
}

variable "modal_endpoint_url" {
  description = "Modal HTTPS endpoint for GPU inference. Required when using modal proxy."
  type        = string
  default     = ""

  validation {
    condition = (
      trimspace(var.infer_lambda_arn) != "" ||
      var.enable_modal_inference_proxy == false ||
      can(regex("^https://", trimspace(var.modal_endpoint_url)))
    )
    error_message = "modal_endpoint_url must be an HTTPS URL when infer_lambda_arn is empty and enable_modal_inference_proxy is true."
  }
}

variable "modal_proxy_auth_secret_arn" {
  description = "Existing Secrets Manager ARN holding Modal proxy auth material. Leave empty to create one when modal proxy is enabled."
  type        = string
  default     = ""
}

variable "modal_request_timeout_seconds" {
  description = "Timeout used by the modal proxy Lambda when calling Modal."
  type        = number
  default     = 30

  validation {
    condition     = var.modal_request_timeout_seconds >= 3 && var.modal_request_timeout_seconds <= 90
    error_message = "modal_request_timeout_seconds must be between 3 and 90."
  }
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

variable "tags" {
  description = "Additional tags applied to resources."
  type        = map(string)
  default     = {}
}
