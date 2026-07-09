data "archive_file" "turnstile_broker" {
  type        = "zip"
  source_dir  = "${path.module}/lambdas/turnstile_broker"
  output_path = "${path.module}/turnstile_broker.zip"
}

resource "aws_cloudwatch_log_group" "turnstile_broker" {
  name              = "/aws/lambda/${local.name_prefix}-turnstile-broker"
  retention_in_days = var.log_retention_days
}

resource "aws_lambda_function" "turnstile_broker" {
  function_name = "${local.name_prefix}-turnstile-broker"
  role          = aws_iam_role.turnstile_broker.arn
  runtime       = "python3.12"
  handler       = "index.handler"
  timeout       = 10
  memory_size   = 256

  filename         = data.archive_file.turnstile_broker.output_path
  source_code_hash = data.archive_file.turnstile_broker.output_base64sha256

  environment {
    variables = {
      TURNSTILE_SECRET_ARN       = local.turnstile_secret_arn
      SESSION_SIGNING_SECRET_ARN = local.session_secret_arn
      TURNSTILE_SITEVERIFY_URL   = var.turnstile_siteverify_url
      TOKEN_TTL_SECONDS          = tostring(var.token_ttl_seconds)
      ALLOWED_ORIGINS            = join(",", var.allowed_origins)
    }
  }

  depends_on = [
    aws_cloudwatch_log_group.turnstile_broker,
    aws_iam_role_policy.turnstile_broker_secrets,
    aws_iam_role_policy_attachment.turnstile_broker_basic
  ]
}

data "archive_file" "intake_handler" {
  count = local.intake_route_enabled ? 1 : 0

  type        = "zip"
  source_dir  = "${path.module}/lambdas/intake_handler"
  output_path = "${path.module}/intake_handler.zip"
}

resource "aws_cloudwatch_log_group" "intake_handler" {
  count = local.intake_route_enabled ? 1 : 0

  name              = "/aws/lambda/${local.name_prefix}-intake-handler"
  retention_in_days = var.log_retention_days
}

resource "aws_lambda_function" "intake_handler" {
  count = local.intake_route_enabled ? 1 : 0

  function_name = "${local.name_prefix}-intake-handler"
  role          = aws_iam_role.intake_handler[0].arn
  runtime       = "python3.12"
  handler       = "index.handler"
  timeout       = 10
  memory_size   = 128

  filename         = data.archive_file.intake_handler[0].output_path
  source_code_hash = data.archive_file.intake_handler[0].output_base64sha256

  environment {
    variables = {
      ALLOWED_ORIGINS        = join(",", var.allowed_origins)
      INTAKE_SENDER_EMAIL    = trimspace(var.intake_sender_email)
      INTAKE_RECIPIENT_EMAIL = trimspace(var.intake_recipient_email)
    }
  }

  depends_on = [
    aws_cloudwatch_log_group.intake_handler,
    aws_iam_role_policy.intake_handler_ses,
    aws_iam_role_policy_attachment.intake_handler_basic
  ]
}
