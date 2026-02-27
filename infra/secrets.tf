resource "aws_secretsmanager_secret" "turnstile" {
  count = trimspace(var.turnstile_secret_arn) == "" ? 1 : 0

  name                    = "${local.name_prefix}/turnstile/secret"
  description             = "Cloudflare Turnstile secret key for ${local.name_prefix}."
  recovery_window_in_days = 7
}

resource "aws_secretsmanager_secret" "session_signing" {
  count = trimspace(var.session_signing_secret_arn) == "" ? 1 : 0

  name                    = "${local.name_prefix}/session/signing-key"
  description             = "HMAC signing key for API session tokens in ${local.name_prefix}."
  recovery_window_in_days = 7
}

resource "aws_secretsmanager_secret" "modal_proxy_auth" {
  count = local.use_modal_proxy && trimspace(var.modal_proxy_auth_secret_arn) == "" ? 1 : 0

  name                    = "${local.name_prefix}/modal/proxy-auth"
  description             = "Modal proxy auth payload for ${local.name_prefix}."
  recovery_window_in_days = 7
}
