# --- Session authorizer Lambda ---

data "archive_file" "session_authorizer" {
  type        = "zip"
  source_dir  = "${path.module}/lambdas/session_authorizer"
  output_path = "${path.module}/session_authorizer.zip"
}

resource "aws_cloudwatch_log_group" "session_authorizer" {
  name              = "/aws/lambda/${local.name_prefix}-session-authorizer"
  retention_in_days = var.log_retention_days
}

resource "aws_iam_role" "session_authorizer" {
  name = "${local.name_prefix}-session-authorizer"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Principal = {
          Service = "lambda.amazonaws.com"
        }
        Action = "sts:AssumeRole"
      }
    ]
  })
}

resource "aws_iam_role_policy_attachment" "session_authorizer_basic" {
  role       = aws_iam_role.session_authorizer.name
  policy_arn = "arn:${data.aws_partition.current.partition}:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

resource "aws_iam_role_policy" "session_authorizer_secrets" {
  name = "${local.name_prefix}-authorizer-secrets"
  role = aws_iam_role.session_authorizer.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = ["secretsmanager:GetSecretValue"]
        Resource = [local.session_secret_arn]
      }
    ]
  })
}

resource "aws_lambda_function" "session_authorizer" {
  function_name = "${local.name_prefix}-session-authorizer"
  role          = aws_iam_role.session_authorizer.arn
  runtime       = "python3.12"
  handler       = "index.handler"
  timeout       = 5
  memory_size   = 128

  filename         = data.archive_file.session_authorizer.output_path
  source_code_hash = data.archive_file.session_authorizer.output_base64sha256

  environment {
    variables = {
      SESSION_SIGNING_SECRET_ARN = local.session_secret_arn
    }
  }

  depends_on = [
    aws_cloudwatch_log_group.session_authorizer,
    aws_iam_role_policy.session_authorizer_secrets,
    aws_iam_role_policy_attachment.session_authorizer_basic
  ]
}

# --- API Gateway authorizer resource ---

resource "aws_api_gateway_authorizer" "session" {
  rest_api_id                      = aws_api_gateway_rest_api.main.id
  name                             = "${local.name_prefix}-session-auth"
  type                             = "TOKEN"
  authorizer_uri                   = aws_lambda_function.session_authorizer.invoke_arn
  identity_source                  = "method.request.header.Authorization"
  authorizer_result_ttl_in_seconds = var.authorizer_cache_ttl_seconds
}

resource "aws_lambda_permission" "allow_authorizer" {
  statement_id  = "AllowExecutionFromAPIGatewayAuthorizer"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.session_authorizer.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_api_gateway_rest_api.main.execution_arn}/authorizers/${aws_api_gateway_authorizer.session.id}"
}

# --- Gateway responses for CORS on auth errors ---

resource "aws_api_gateway_gateway_response" "unauthorized" {
  rest_api_id   = aws_api_gateway_rest_api.main.id
  response_type = "UNAUTHORIZED"

  response_parameters = {
    "gatewayresponse.header.Access-Control-Allow-Origin"  = "'*'"
    "gatewayresponse.header.Access-Control-Allow-Headers" = "'${local.cors_allowed_headers}'"
    "gatewayresponse.header.Access-Control-Allow-Methods" = "'${local.cors_allowed_methods}'"
  }

  response_templates = {
    "application/json" = "{\"code\": \"unauthorized\", \"message\": \"Invalid or missing session token\"}"
  }
}

resource "aws_api_gateway_gateway_response" "access_denied" {
  rest_api_id   = aws_api_gateway_rest_api.main.id
  response_type = "ACCESS_DENIED"

  response_parameters = {
    "gatewayresponse.header.Access-Control-Allow-Origin"  = "'*'"
    "gatewayresponse.header.Access-Control-Allow-Headers" = "'${local.cors_allowed_headers}'"
    "gatewayresponse.header.Access-Control-Allow-Methods" = "'${local.cors_allowed_methods}'"
  }

  response_templates = {
    "application/json" = "{\"code\": \"access_denied\", \"message\": \"Access denied\"}"
  }
}

resource "aws_api_gateway_gateway_response" "default_4xx" {
  rest_api_id   = aws_api_gateway_rest_api.main.id
  response_type = "DEFAULT_4XX"

  response_parameters = {
    "gatewayresponse.header.Access-Control-Allow-Origin"  = "'*'"
    "gatewayresponse.header.Access-Control-Allow-Headers" = "'${local.cors_allowed_headers}'"
    "gatewayresponse.header.Access-Control-Allow-Methods" = "'${local.cors_allowed_methods}'"
  }

  response_templates = {
    "application/json" = "{\"code\": \"bad_request\", \"message\": $context.error.messageString}"
  }
}

resource "aws_api_gateway_gateway_response" "default_5xx" {
  rest_api_id   = aws_api_gateway_rest_api.main.id
  response_type = "DEFAULT_5XX"

  response_parameters = {
    "gatewayresponse.header.Access-Control-Allow-Origin"  = "'*'"
    "gatewayresponse.header.Access-Control-Allow-Headers" = "'${local.cors_allowed_headers}'"
    "gatewayresponse.header.Access-Control-Allow-Methods" = "'${local.cors_allowed_methods}'"
  }

  response_templates = {
    "application/json" = "{\"code\": \"server_error\", \"message\": $context.error.messageString}"
  }
}
