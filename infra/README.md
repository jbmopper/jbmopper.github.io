# AWS API Security Stack (API Gateway + WAF + Turnstile)

This directory provisions a protected API layer in AWS for backend Lambda workloads used by the site.

## What this stack creates

- API Gateway REST API with optional routes:
  - `POST /v1/session/turnstile-verify` (always created)
  - `POST /v1/resume/generate` (if `resume_lambda_arn` is set)
  - `POST /v1/chat/respond` (if `chat_lambda_arn` is set)
  - `POST /v1/infer/generate` (if `infer_lambda_arn` is set)
  - `POST /v1/infer/warmup` (if `infer_lambda_arn` is set)
- AWS WAFv2 Web ACL attached to the API stage
- Turnstile broker Lambda (verifies token and mints short-lived session token)
- Secrets Manager placeholders for required secrets (unless existing ARNs are supplied)

## Authentication and deploy model

- Local infrastructure operations: **AWS CLI SSO**
- CI infrastructure operations: **GitHub OIDC role assumption** (no static AWS keys)

## Prerequisites

- Terraform >= 1.6
- AWS CLI v2 with SSO configured
- AWS IAM role permissions for API Gateway, Lambda, WAFv2, IAM, CloudWatch Logs, Secrets Manager

## Local SSO workflow

```bash
aws configure sso --profile juliusm-prod
aws sso login --profile juliusm-prod

# Optional helper script
./scripts/infra-sso-login.sh juliusm-prod
```

## Configure variables

Start from the example tfvars:

```bash
cp infra/examples/prod.tfvars.example infra/prod.tfvars
```

Populate:

- existing Lambda ARNs for resume/chat (and optionally infer)
- optional existing secret ARNs
- custom domain/certificate if desired

Current inference integration note:

- this stack exposes the unchanged inference Lambda's native `POST /generate` and `POST /warmup` routes
- frontend/component changes are deferred to a later pass, so callers must currently send the Lambda's native request shape

## Secrets payload formats

The Lambdas accept either raw strings or JSON payloads in Secrets Manager.

### Turnstile secret

JSON example:

```json
{"turnstile_secret":"<cloudflare-turnstile-secret>"}
```

### Session signing key

JSON example:

```json
{"session_signing_key":"<long-random-hmac-secret>"}
```

## Apply locally

```bash
terraform -chdir=infra init
terraform -chdir=infra fmt -recursive
terraform -chdir=infra validate
terraform -chdir=infra plan -var-file=prod.tfvars
terraform -chdir=infra apply -var-file=prod.tfvars
```

## Lambda unit tests

Run unit tests for infra Lambda handlers:

```bash
./scripts/test-infra-lambdas.sh
```

Direct invocation:

```bash
python3 -m unittest discover -s infra/lambdas/tests -p 'test_*.py' -v
```

## Outputs and DNS

After apply:

- `api_invoke_url` gives direct execute-api stage URL
- If custom domain is enabled, use:
  - `custom_domain_target`
  - `custom_domain_hosted_zone_id`

Create a Cloudflare CNAME for `api.juliusm.com` to the `custom_domain_target`.

## Security notes

- WAF protection in this stack covers API Gateway traffic.
- If traffic goes directly from browser to external providers, WAF does not protect it.
