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

resource "aws_iam_role" "modal_proxy" {
  count = local.use_modal_proxy ? 1 : 0

  name = "${local.name_prefix}-modal-proxy"

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

resource "aws_iam_role_policy_attachment" "modal_proxy_basic" {
  count = local.use_modal_proxy ? 1 : 0

  role       = aws_iam_role.modal_proxy[0].name
  policy_arn = "arn:${data.aws_partition.current.partition}:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

resource "aws_iam_role_policy" "modal_proxy_secrets" {
  count = local.use_modal_proxy ? 1 : 0

  name = "${local.name_prefix}-modal-secrets"
  role = aws_iam_role.modal_proxy[0].id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "secretsmanager:GetSecretValue"
        ]
        Resource = compact([
          local.session_secret_arn,
          local.modal_proxy_auth_secret_arn
        ])
      }
    ]
  })
}
