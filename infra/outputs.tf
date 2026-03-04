output "api_gateway_rest_api_id" {
  description = "REST API ID."
  value       = aws_api_gateway_rest_api.main.id
}

output "api_gateway_execution_arn" {
  description = "Execution ARN for API Gateway; useful for lambda permissions and policy conditions."
  value       = aws_api_gateway_rest_api.main.execution_arn
}

output "api_invoke_url" {
  description = "Base invoke URL for API stage."
  value       = "https://${aws_api_gateway_rest_api.main.id}.execute-api.${var.aws_region}.amazonaws.com/${aws_api_gateway_stage.main.stage_name}"
}

output "turnstile_verify_url" {
  description = "Session broker endpoint for Turnstile verification."
  value       = "https://${aws_api_gateway_rest_api.main.id}.execute-api.${var.aws_region}.amazonaws.com/${aws_api_gateway_stage.main.stage_name}/v1/session/turnstile-verify"
}

output "waf_web_acl_arn" {
  description = "WAF Web ACL ARN associated with API stage."
  value       = aws_wafv2_web_acl.api.arn
}

output "turnstile_secret_arn" {
  description = "Turnstile secret ARN used by broker lambda."
  value       = local.turnstile_secret_arn
}

output "session_signing_secret_arn" {
  description = "Session signing secret ARN used by broker/authorizer lambdas."
  value       = local.session_secret_arn
}

output "custom_domain_target" {
  description = "Regional API Gateway target domain for DNS CNAME (if custom domain is enabled)."
  value       = try(aws_api_gateway_domain_name.main[0].regional_domain_name, null)
}

output "custom_domain_hosted_zone_id" {
  description = "Hosted zone ID for API Gateway regional domain target."
  value       = try(aws_api_gateway_domain_name.main[0].regional_zone_id, null)
}
