resource "aws_iam_role" "apigw_cloudwatch" {
  name = "${local.name_prefix}-apigw-cloudwatch"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Principal = {
          Service = "apigateway.amazonaws.com"
        }
        Action = "sts:AssumeRole"
      }
    ]
  })
}

resource "aws_iam_role_policy_attachment" "apigw_cloudwatch" {
  role       = aws_iam_role.apigw_cloudwatch.name
  policy_arn = "arn:${data.aws_partition.current.partition}:iam::aws:policy/service-role/AmazonAPIGatewayPushToCloudWatchLogs"
}

resource "aws_iam_role" "turnstile_broker" {
  name = "${local.name_prefix}-turnstile-broker"

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

resource "aws_iam_role_policy_attachment" "turnstile_broker_basic" {
  role       = aws_iam_role.turnstile_broker.name
  policy_arn = "arn:${data.aws_partition.current.partition}:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

resource "aws_iam_role_policy" "turnstile_broker_secrets" {
  name = "${local.name_prefix}-turnstile-secrets"
  role = aws_iam_role.turnstile_broker.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "secretsmanager:GetSecretValue"
        ]
        Resource = [
          local.turnstile_secret_arn,
          local.session_secret_arn
        ]
      }
    ]
  })
}

resource "aws_iam_role" "intake_handler" {
  count = local.intake_route_enabled ? 1 : 0

  name = "${local.name_prefix}-intake-handler"

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

resource "aws_iam_role_policy_attachment" "intake_handler_basic" {
  count = local.intake_route_enabled ? 1 : 0

  role       = aws_iam_role.intake_handler[0].name
  policy_arn = "arn:${data.aws_partition.current.partition}:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

resource "aws_iam_role_policy" "intake_handler_ses" {
  count = local.intake_route_enabled ? 1 : 0

  name = "${local.name_prefix}-intake-ses"
  role = aws_iam_role.intake_handler[0].id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "ses:SendEmail"
        ]
        Resource = aws_sesv2_email_identity.domain[0].arn
      }
    ]
  })
}
