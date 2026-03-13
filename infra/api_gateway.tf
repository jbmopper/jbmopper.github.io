resource "aws_api_gateway_rest_api" "main" {
  name        = "${local.name_prefix}-api"
  description = "Protected API for resume/chat/inference endpoints"

  endpoint_configuration {
    types = ["REGIONAL"]
  }
}

resource "aws_cloudwatch_log_group" "api_access" {
  name              = "/aws/apigateway/${local.name_prefix}-${var.stage_name}"
  retention_in_days = var.log_retention_days
}

resource "aws_api_gateway_account" "main" {
  cloudwatch_role_arn = aws_iam_role.apigw_cloudwatch.arn
}

resource "aws_api_gateway_resource" "v1" {
  rest_api_id = aws_api_gateway_rest_api.main.id
  parent_id   = aws_api_gateway_rest_api.main.root_resource_id
  path_part   = "v1"
}

resource "aws_api_gateway_resource" "session" {
  rest_api_id = aws_api_gateway_rest_api.main.id
  parent_id   = aws_api_gateway_resource.v1.id
  path_part   = "session"
}

resource "aws_api_gateway_resource" "turnstile_verify" {
  rest_api_id = aws_api_gateway_rest_api.main.id
  parent_id   = aws_api_gateway_resource.session.id
  path_part   = "turnstile-verify"
}

resource "aws_api_gateway_resource" "resume" {
  rest_api_id = aws_api_gateway_rest_api.main.id
  parent_id   = aws_api_gateway_resource.v1.id
  path_part   = "resume"
}

resource "aws_api_gateway_resource" "resume_generate" {
  rest_api_id = aws_api_gateway_rest_api.main.id
  parent_id   = aws_api_gateway_resource.resume.id
  path_part   = "generate"
}

resource "aws_api_gateway_resource" "chat" {
  rest_api_id = aws_api_gateway_rest_api.main.id
  parent_id   = aws_api_gateway_resource.v1.id
  path_part   = "chat"
}

resource "aws_api_gateway_resource" "chat_respond" {
  rest_api_id = aws_api_gateway_rest_api.main.id
  parent_id   = aws_api_gateway_resource.chat.id
  path_part   = "respond"
}

resource "aws_api_gateway_resource" "infer_generate" {
  count = local.infer_route_enabled ? 1 : 0

  rest_api_id = aws_api_gateway_rest_api.main.id
  parent_id   = aws_api_gateway_rest_api.main.root_resource_id
  path_part   = "generate"
}

resource "aws_api_gateway_resource" "infer_warmup" {
  count = local.infer_route_enabled ? 1 : 0

  rest_api_id = aws_api_gateway_rest_api.main.id
  parent_id   = aws_api_gateway_rest_api.main.root_resource_id
  path_part   = "warmup"
}

resource "aws_api_gateway_method" "turnstile_post" {
  rest_api_id   = aws_api_gateway_rest_api.main.id
  resource_id   = aws_api_gateway_resource.turnstile_verify.id
  http_method   = "POST"
  authorization = "NONE"
}

resource "aws_api_gateway_integration" "turnstile_post" {
  rest_api_id             = aws_api_gateway_rest_api.main.id
  resource_id             = aws_api_gateway_resource.turnstile_verify.id
  http_method             = aws_api_gateway_method.turnstile_post.http_method
  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = aws_lambda_function.turnstile_broker.invoke_arn
}

resource "aws_api_gateway_method" "resume_post" {
  count = local.resume_route_enabled ? 1 : 0

  rest_api_id   = aws_api_gateway_rest_api.main.id
  resource_id   = aws_api_gateway_resource.resume_generate.id
  http_method   = "POST"
  authorization = "CUSTOM"
  authorizer_id = aws_api_gateway_authorizer.session.id
}

resource "aws_api_gateway_integration" "resume_post" {
  count = local.resume_route_enabled ? 1 : 0

  rest_api_id             = aws_api_gateway_rest_api.main.id
  resource_id             = aws_api_gateway_resource.resume_generate.id
  http_method             = aws_api_gateway_method.resume_post[0].http_method
  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = "arn:aws:apigateway:${var.aws_region}:lambda:path/2015-03-31/functions/${var.resume_lambda_arn}/invocations"
}

# --- Resume job status polling route: GET /v1/resume/job/{jobId} ---

resource "aws_api_gateway_resource" "resume_job" {
  count = local.resume_route_enabled ? 1 : 0

  rest_api_id = aws_api_gateway_rest_api.main.id
  parent_id   = aws_api_gateway_resource.resume.id
  path_part   = "job"
}

resource "aws_api_gateway_resource" "resume_job_id" {
  count = local.resume_route_enabled ? 1 : 0

  rest_api_id = aws_api_gateway_rest_api.main.id
  parent_id   = aws_api_gateway_resource.resume_job[0].id
  path_part   = "{jobId}"
}

resource "aws_api_gateway_method" "resume_job_get" {
  count = local.resume_route_enabled ? 1 : 0

  rest_api_id   = aws_api_gateway_rest_api.main.id
  resource_id   = aws_api_gateway_resource.resume_job_id[0].id
  http_method   = "GET"
  authorization = "CUSTOM"
  authorizer_id = aws_api_gateway_authorizer.session.id
}

resource "aws_api_gateway_integration" "resume_job_get" {
  count = local.resume_route_enabled ? 1 : 0

  rest_api_id             = aws_api_gateway_rest_api.main.id
  resource_id             = aws_api_gateway_resource.resume_job_id[0].id
  http_method             = aws_api_gateway_method.resume_job_get[0].http_method
  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = "arn:aws:apigateway:${var.aws_region}:lambda:path/2015-03-31/functions/${var.resume_lambda_arn}/invocations"
}

resource "aws_api_gateway_method" "options_resume_job" {
  count = local.resume_route_enabled ? 1 : 0

  rest_api_id   = aws_api_gateway_rest_api.main.id
  resource_id   = aws_api_gateway_resource.resume_job_id[0].id
  http_method   = "OPTIONS"
  authorization = "NONE"
}

resource "aws_api_gateway_integration" "options_resume_job" {
  count = local.resume_route_enabled ? 1 : 0

  rest_api_id = aws_api_gateway_rest_api.main.id
  resource_id = aws_api_gateway_resource.resume_job_id[0].id
  http_method = aws_api_gateway_method.options_resume_job[0].http_method
  type        = "MOCK"

  request_templates = {
    "application/json" = "{\"statusCode\": 200}"
  }
}

resource "aws_api_gateway_method_response" "options_resume_job_200" {
  count = local.resume_route_enabled ? 1 : 0

  rest_api_id = aws_api_gateway_rest_api.main.id
  resource_id = aws_api_gateway_resource.resume_job_id[0].id
  http_method = aws_api_gateway_method.options_resume_job[0].http_method
  status_code = "200"

  response_parameters = {
    "method.response.header.Access-Control-Allow-Origin"  = true
    "method.response.header.Access-Control-Allow-Methods" = true
    "method.response.header.Access-Control-Allow-Headers" = true
    "method.response.header.Access-Control-Max-Age"       = true
  }
}

resource "aws_api_gateway_integration_response" "options_resume_job_200" {
  count = local.resume_route_enabled ? 1 : 0

  rest_api_id = aws_api_gateway_rest_api.main.id
  resource_id = aws_api_gateway_resource.resume_job_id[0].id
  http_method = aws_api_gateway_method.options_resume_job[0].http_method
  status_code = aws_api_gateway_method_response.options_resume_job_200[0].status_code

  response_parameters = {
    "method.response.header.Access-Control-Allow-Origin"  = "'*'"
    "method.response.header.Access-Control-Allow-Methods" = "'${local.cors_allowed_methods}'"
    "method.response.header.Access-Control-Allow-Headers" = "'${local.cors_allowed_headers}'"
    "method.response.header.Access-Control-Max-Age"       = "'${local.cors_max_age}'"
  }
}

resource "aws_api_gateway_method" "chat_post" {
  count = local.chat_route_enabled ? 1 : 0

  rest_api_id   = aws_api_gateway_rest_api.main.id
  resource_id   = aws_api_gateway_resource.chat_respond.id
  http_method   = "POST"
  authorization = "NONE"
}

resource "aws_api_gateway_integration" "chat_post" {
  count = local.chat_route_enabled ? 1 : 0

  rest_api_id             = aws_api_gateway_rest_api.main.id
  resource_id             = aws_api_gateway_resource.chat_respond.id
  http_method             = aws_api_gateway_method.chat_post[0].http_method
  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = "arn:aws:apigateway:${var.aws_region}:lambda:path/2015-03-31/functions/${var.chat_lambda_arn}/invocations"
}

resource "aws_api_gateway_method" "infer_generate_post" {
  count = local.infer_route_enabled ? 1 : 0

  rest_api_id   = aws_api_gateway_rest_api.main.id
  resource_id   = aws_api_gateway_resource.infer_generate[0].id
  authorizer_id = aws_api_gateway_authorizer.session.id
  http_method   = "POST"
  authorization = "CUSTOM"
}

resource "aws_api_gateway_integration" "infer_generate_post" {
  count = local.infer_route_enabled ? 1 : 0

  rest_api_id             = aws_api_gateway_rest_api.main.id
  resource_id             = aws_api_gateway_resource.infer_generate[0].id
  http_method             = aws_api_gateway_method.infer_generate_post[0].http_method
  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  response_transfer_mode  = "STREAM"
  accept                  = "text/event-stream"
  timeout_milliseconds    = 600000
  uri                     = "arn:aws:apigateway:${var.aws_region}:lambda:path/2021-11-15/functions/${var.infer_lambda_arn}/response-streaming-invocations"
}

resource "aws_api_gateway_method" "infer_warmup_post" {
  count = local.infer_route_enabled ? 1 : 0

  rest_api_id   = aws_api_gateway_rest_api.main.id
  resource_id   = aws_api_gateway_resource.infer_warmup[0].id
  authorizer_id = aws_api_gateway_authorizer.session.id
  http_method   = "POST"
  authorization = "CUSTOM"
}

resource "aws_api_gateway_integration" "infer_warmup_post" {
  count = local.infer_route_enabled ? 1 : 0

  rest_api_id             = aws_api_gateway_rest_api.main.id
  resource_id             = aws_api_gateway_resource.infer_warmup[0].id
  http_method             = aws_api_gateway_method.infer_warmup_post[0].http_method
  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = "arn:aws:apigateway:${var.aws_region}:lambda:path/2015-03-31/functions/${var.infer_lambda_arn}/invocations"
}

resource "aws_api_gateway_method" "options_turnstile" {
  rest_api_id   = aws_api_gateway_rest_api.main.id
  resource_id   = aws_api_gateway_resource.turnstile_verify.id
  http_method   = "OPTIONS"
  authorization = "NONE"
}

resource "aws_api_gateway_integration" "options_turnstile" {
  rest_api_id = aws_api_gateway_rest_api.main.id
  resource_id = aws_api_gateway_resource.turnstile_verify.id
  http_method = aws_api_gateway_method.options_turnstile.http_method
  type        = "MOCK"

  request_templates = {
    "application/json" = "{\"statusCode\": 200}"
  }
}

resource "aws_api_gateway_method_response" "options_turnstile_200" {
  rest_api_id = aws_api_gateway_rest_api.main.id
  resource_id = aws_api_gateway_resource.turnstile_verify.id
  http_method = aws_api_gateway_method.options_turnstile.http_method
  status_code = "200"

  response_parameters = {
    "method.response.header.Access-Control-Allow-Origin"  = true
    "method.response.header.Access-Control-Allow-Methods" = true
    "method.response.header.Access-Control-Allow-Headers" = true
    "method.response.header.Access-Control-Max-Age"       = true
  }
}

resource "aws_api_gateway_integration_response" "options_turnstile_200" {
  rest_api_id = aws_api_gateway_rest_api.main.id
  resource_id = aws_api_gateway_resource.turnstile_verify.id
  http_method = aws_api_gateway_method.options_turnstile.http_method
  status_code = aws_api_gateway_method_response.options_turnstile_200.status_code

  response_parameters = {
    "method.response.header.Access-Control-Allow-Origin"  = "'*'"
    "method.response.header.Access-Control-Allow-Methods" = "'${local.cors_allowed_methods}'"
    "method.response.header.Access-Control-Allow-Headers" = "'${local.cors_allowed_headers}'"
    "method.response.header.Access-Control-Max-Age"       = "'${local.cors_max_age}'"
  }
}

resource "aws_api_gateway_method" "options_resume" {
  count = local.resume_route_enabled ? 1 : 0

  rest_api_id   = aws_api_gateway_rest_api.main.id
  resource_id   = aws_api_gateway_resource.resume_generate.id
  http_method   = "OPTIONS"
  authorization = "NONE"
}

resource "aws_api_gateway_integration" "options_resume" {
  count = local.resume_route_enabled ? 1 : 0

  rest_api_id = aws_api_gateway_rest_api.main.id
  resource_id = aws_api_gateway_resource.resume_generate.id
  http_method = aws_api_gateway_method.options_resume[0].http_method
  type        = "MOCK"

  request_templates = {
    "application/json" = "{\"statusCode\": 200}"
  }
}

resource "aws_api_gateway_method_response" "options_resume_200" {
  count = local.resume_route_enabled ? 1 : 0

  rest_api_id = aws_api_gateway_rest_api.main.id
  resource_id = aws_api_gateway_resource.resume_generate.id
  http_method = aws_api_gateway_method.options_resume[0].http_method
  status_code = "200"

  response_parameters = {
    "method.response.header.Access-Control-Allow-Origin"  = true
    "method.response.header.Access-Control-Allow-Methods" = true
    "method.response.header.Access-Control-Allow-Headers" = true
    "method.response.header.Access-Control-Max-Age"       = true
  }
}

resource "aws_api_gateway_integration_response" "options_resume_200" {
  count = local.resume_route_enabled ? 1 : 0

  rest_api_id = aws_api_gateway_rest_api.main.id
  resource_id = aws_api_gateway_resource.resume_generate.id
  http_method = aws_api_gateway_method.options_resume[0].http_method
  status_code = aws_api_gateway_method_response.options_resume_200[0].status_code

  response_parameters = {
    "method.response.header.Access-Control-Allow-Origin"  = "'*'"
    "method.response.header.Access-Control-Allow-Methods" = "'${local.cors_allowed_methods}'"
    "method.response.header.Access-Control-Allow-Headers" = "'${local.cors_allowed_headers}'"
    "method.response.header.Access-Control-Max-Age"       = "'${local.cors_max_age}'"
  }
}

resource "aws_api_gateway_method" "options_chat" {
  count = local.chat_route_enabled ? 1 : 0

  rest_api_id   = aws_api_gateway_rest_api.main.id
  resource_id   = aws_api_gateway_resource.chat_respond.id
  http_method   = "OPTIONS"
  authorization = "NONE"
}

resource "aws_api_gateway_integration" "options_chat" {
  count = local.chat_route_enabled ? 1 : 0

  rest_api_id = aws_api_gateway_rest_api.main.id
  resource_id = aws_api_gateway_resource.chat_respond.id
  http_method = aws_api_gateway_method.options_chat[0].http_method
  type        = "MOCK"

  request_templates = {
    "application/json" = "{\"statusCode\": 200}"
  }
}

resource "aws_api_gateway_method_response" "options_chat_200" {
  count = local.chat_route_enabled ? 1 : 0

  rest_api_id = aws_api_gateway_rest_api.main.id
  resource_id = aws_api_gateway_resource.chat_respond.id
  http_method = aws_api_gateway_method.options_chat[0].http_method
  status_code = "200"

  response_parameters = {
    "method.response.header.Access-Control-Allow-Origin"  = true
    "method.response.header.Access-Control-Allow-Methods" = true
    "method.response.header.Access-Control-Allow-Headers" = true
    "method.response.header.Access-Control-Max-Age"       = true
  }
}

resource "aws_api_gateway_integration_response" "options_chat_200" {
  count = local.chat_route_enabled ? 1 : 0

  rest_api_id = aws_api_gateway_rest_api.main.id
  resource_id = aws_api_gateway_resource.chat_respond.id
  http_method = aws_api_gateway_method.options_chat[0].http_method
  status_code = aws_api_gateway_method_response.options_chat_200[0].status_code

  response_parameters = {
    "method.response.header.Access-Control-Allow-Origin"  = "'*'"
    "method.response.header.Access-Control-Allow-Methods" = "'${local.cors_allowed_methods}'"
    "method.response.header.Access-Control-Allow-Headers" = "'${local.cors_allowed_headers}'"
    "method.response.header.Access-Control-Max-Age"       = "'${local.cors_max_age}'"
  }
}

resource "aws_api_gateway_method" "options_infer_generate" {
  count = local.infer_route_enabled ? 1 : 0

  rest_api_id   = aws_api_gateway_rest_api.main.id
  resource_id   = aws_api_gateway_resource.infer_generate[0].id
  http_method   = "OPTIONS"
  authorization = "NONE"
}

resource "aws_api_gateway_integration" "options_infer_generate" {
  count = local.infer_route_enabled ? 1 : 0

  rest_api_id = aws_api_gateway_rest_api.main.id
  resource_id = aws_api_gateway_resource.infer_generate[0].id
  http_method = aws_api_gateway_method.options_infer_generate[0].http_method
  type        = "MOCK"

  request_templates = {
    "application/json" = "{\"statusCode\": 200}"
  }
}

resource "aws_api_gateway_method_response" "options_infer_generate_200" {
  count = local.infer_route_enabled ? 1 : 0

  rest_api_id = aws_api_gateway_rest_api.main.id
  resource_id = aws_api_gateway_resource.infer_generate[0].id
  http_method = aws_api_gateway_method.options_infer_generate[0].http_method
  status_code = "200"

  response_parameters = {
    "method.response.header.Access-Control-Allow-Origin"  = true
    "method.response.header.Access-Control-Allow-Methods" = true
    "method.response.header.Access-Control-Allow-Headers" = true
    "method.response.header.Access-Control-Max-Age"       = true
  }
}

resource "aws_api_gateway_integration_response" "options_infer_generate_200" {
  count = local.infer_route_enabled ? 1 : 0

  rest_api_id = aws_api_gateway_rest_api.main.id
  resource_id = aws_api_gateway_resource.infer_generate[0].id
  http_method = aws_api_gateway_method.options_infer_generate[0].http_method
  status_code = aws_api_gateway_method_response.options_infer_generate_200[0].status_code

  response_parameters = {
    "method.response.header.Access-Control-Allow-Origin"  = "'*'"
    "method.response.header.Access-Control-Allow-Methods" = "'${local.cors_allowed_methods}'"
    "method.response.header.Access-Control-Allow-Headers" = "'${local.cors_allowed_headers}'"
    "method.response.header.Access-Control-Max-Age"       = "'${local.cors_max_age}'"
  }
}

resource "aws_api_gateway_method" "options_infer_warmup" {
  count = local.infer_route_enabled ? 1 : 0

  rest_api_id   = aws_api_gateway_rest_api.main.id
  resource_id   = aws_api_gateway_resource.infer_warmup[0].id
  http_method   = "OPTIONS"
  authorization = "NONE"
}

resource "aws_api_gateway_integration" "options_infer_warmup" {
  count = local.infer_route_enabled ? 1 : 0

  rest_api_id = aws_api_gateway_rest_api.main.id
  resource_id = aws_api_gateway_resource.infer_warmup[0].id
  http_method = aws_api_gateway_method.options_infer_warmup[0].http_method
  type        = "MOCK"

  request_templates = {
    "application/json" = "{\"statusCode\": 200}"
  }
}

resource "aws_api_gateway_method_response" "options_infer_warmup_200" {
  count = local.infer_route_enabled ? 1 : 0

  rest_api_id = aws_api_gateway_rest_api.main.id
  resource_id = aws_api_gateway_resource.infer_warmup[0].id
  http_method = aws_api_gateway_method.options_infer_warmup[0].http_method
  status_code = "200"

  response_parameters = {
    "method.response.header.Access-Control-Allow-Origin"  = true
    "method.response.header.Access-Control-Allow-Methods" = true
    "method.response.header.Access-Control-Allow-Headers" = true
    "method.response.header.Access-Control-Max-Age"       = true
  }
}

resource "aws_api_gateway_integration_response" "options_infer_warmup_200" {
  count = local.infer_route_enabled ? 1 : 0

  rest_api_id = aws_api_gateway_rest_api.main.id
  resource_id = aws_api_gateway_resource.infer_warmup[0].id
  http_method = aws_api_gateway_method.options_infer_warmup[0].http_method
  status_code = aws_api_gateway_method_response.options_infer_warmup_200[0].status_code

  response_parameters = {
    "method.response.header.Access-Control-Allow-Origin"  = "'*'"
    "method.response.header.Access-Control-Allow-Methods" = "'${local.cors_allowed_methods}'"
    "method.response.header.Access-Control-Allow-Headers" = "'${local.cors_allowed_headers}'"
    "method.response.header.Access-Control-Max-Age"       = "'${local.cors_max_age}'"
  }
}

resource "aws_api_gateway_deployment" "main" {
  rest_api_id = aws_api_gateway_rest_api.main.id

  triggers = {
    redeployment = sha1(
      jsonencode(
        compact([
          aws_api_gateway_integration.turnstile_post.id,
          aws_api_gateway_integration.options_turnstile.id,
          aws_api_gateway_integration_response.options_turnstile_200.id,
          try(aws_api_gateway_integration.resume_post[0].id, ""),
          try(aws_api_gateway_integration.options_resume[0].id, ""),
          try(aws_api_gateway_integration_response.options_resume_200[0].id, ""),
          try(aws_api_gateway_integration.resume_job_get[0].id, ""),
          try(aws_api_gateway_integration.options_resume_job[0].id, ""),
          try(aws_api_gateway_integration_response.options_resume_job_200[0].id, ""),
          try(aws_api_gateway_integration.chat_post[0].id, ""),
          try(aws_api_gateway_integration.options_chat[0].id, ""),
          try(aws_api_gateway_integration_response.options_chat_200[0].id, ""),
          try(aws_api_gateway_integration.infer_generate_post[0].id, ""),
          try(aws_api_gateway_integration.options_infer_generate[0].id, ""),
          try(aws_api_gateway_integration_response.options_infer_generate_200[0].id, ""),
          try(aws_api_gateway_integration.infer_warmup_post[0].id, ""),
          try(aws_api_gateway_integration.options_infer_warmup[0].id, ""),
          try(aws_api_gateway_integration_response.options_infer_warmup_200[0].id, ""),
          aws_api_gateway_authorizer.session.id
        ])
      )
    )
  }

  lifecycle {
    create_before_destroy = true
  }

  depends_on = [
    aws_api_gateway_integration.turnstile_post,
    aws_api_gateway_integration.options_turnstile,
    aws_api_gateway_integration_response.options_turnstile_200,
    aws_api_gateway_integration.resume_post,
    aws_api_gateway_integration.options_resume,
    aws_api_gateway_integration_response.options_resume_200,
    aws_api_gateway_integration.resume_job_get,
    aws_api_gateway_integration.options_resume_job,
    aws_api_gateway_integration_response.options_resume_job_200,
    aws_api_gateway_integration.chat_post,
    aws_api_gateway_integration.options_chat,
    aws_api_gateway_integration_response.options_chat_200,
    aws_api_gateway_integration.infer_generate_post,
    aws_api_gateway_integration.options_infer_generate,
    aws_api_gateway_integration_response.options_infer_generate_200,
    aws_api_gateway_integration.infer_warmup_post,
    aws_api_gateway_integration.options_infer_warmup,
    aws_api_gateway_integration_response.options_infer_warmup_200
  ]
}

resource "aws_api_gateway_stage" "main" {
  rest_api_id   = aws_api_gateway_rest_api.main.id
  deployment_id = aws_api_gateway_deployment.main.id
  stage_name    = var.stage_name

  access_log_settings {
    destination_arn = aws_cloudwatch_log_group.api_access.arn
    format = jsonencode({
      requestId      = "$context.requestId"
      ip             = "$context.identity.sourceIp"
      requestTime    = "$context.requestTime"
      httpMethod     = "$context.httpMethod"
      route          = "$context.resourcePath"
      status         = "$context.status"
      responseLength = "$context.responseLength"
      errorMessage   = "$context.error.message"
      integrationErr = "$context.integration.error"
    })
  }

  depends_on = [aws_api_gateway_account.main]
}

resource "aws_api_gateway_method_settings" "all" {
  rest_api_id = aws_api_gateway_rest_api.main.id
  stage_name  = aws_api_gateway_stage.main.stage_name
  method_path = "*/*"

  settings {
    metrics_enabled = true
    logging_level   = "INFO"
  }
}

resource "aws_lambda_permission" "allow_turnstile" {
  count = var.manage_lambda_permissions ? 1 : 0

  statement_id  = "AllowExecutionFromAPIGatewayTurnstile"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.turnstile_broker.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_api_gateway_rest_api.main.execution_arn}/*/POST/v1/session/turnstile-verify"
}

resource "aws_lambda_permission" "allow_resume" {
  count = var.manage_lambda_permissions && local.resume_route_enabled ? 1 : 0

  statement_id  = "AllowExecutionFromAPIGatewayResume"
  action        = "lambda:InvokeFunction"
  function_name = var.resume_lambda_arn
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_api_gateway_rest_api.main.execution_arn}/*/POST/v1/resume/generate"
}

resource "aws_lambda_permission" "allow_resume_job_status" {
  count = var.manage_lambda_permissions && local.resume_route_enabled ? 1 : 0

  statement_id  = "AllowExecutionFromAPIGatewayResumeJobStatus"
  action        = "lambda:InvokeFunction"
  function_name = var.resume_lambda_arn
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_api_gateway_rest_api.main.execution_arn}/*/GET/v1/resume/job/*"
}

resource "aws_lambda_permission" "allow_chat" {
  count = var.manage_lambda_permissions && local.chat_route_enabled ? 1 : 0

  statement_id  = "AllowExecutionFromAPIGatewayChat"
  action        = "lambda:InvokeFunction"
  function_name = var.chat_lambda_arn
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_api_gateway_rest_api.main.execution_arn}/*/POST/v1/chat/respond"
}

resource "aws_lambda_permission" "allow_infer_generate" {
  count = var.manage_lambda_permissions && local.infer_route_enabled ? 1 : 0

  statement_id  = "AllowExecutionFromAPIGatewayInferGenerate"
  action        = "lambda:InvokeFunction"
  function_name = var.infer_lambda_arn
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_api_gateway_rest_api.main.execution_arn}/*/POST/generate"
}

resource "aws_lambda_permission" "allow_infer_warmup" {
  count = var.manage_lambda_permissions && local.infer_route_enabled ? 1 : 0

  statement_id  = "AllowExecutionFromAPIGatewayInferWarmup"
  action        = "lambda:InvokeFunction"
  function_name = var.infer_lambda_arn
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_api_gateway_rest_api.main.execution_arn}/*/POST/warmup"
}

resource "aws_api_gateway_domain_name" "main" {
  count = var.enable_custom_domain ? 1 : 0

  domain_name              = var.api_custom_domain_name
  regional_certificate_arn = var.api_certificate_arn
  security_policy          = "TLS_1_2"

  endpoint_configuration {
    types = ["REGIONAL"]
  }
}

resource "aws_api_gateway_base_path_mapping" "main" {
  count = var.enable_custom_domain ? 1 : 0

  api_id      = aws_api_gateway_rest_api.main.id
  stage_name  = aws_api_gateway_stage.main.stage_name
  domain_name = aws_api_gateway_domain_name.main[0].domain_name
}
