# juliusm.com

Portfolio site for Julius Mopper -- AI engineer portfolio with interactive project writeups, a resume generator, and a chatbot (planned).

**Live site:** https://jbmopper.github.io

## Architecture

```
Browser
  |
  |-- GitHub Pages (static Astro site)
  |     Landing page, project writeups (Observable), resume generator UI
  |
  |-- API Gateway REST API (/v1/...)
        |-- WAFv2 (rate limits, managed rules, IP reputation)
        |-- Turnstile broker Lambda (verifies Cloudflare challenge, mints JWT)
        |-- Session authorizer Lambda (validates JWT on protected routes)
        |-- Resume Lambda (generates tailored PDF resumes via LLM)
              |-- S3 (job artifacts: requests, markdown, PDFs)
              |-- Cloud SQL Postgres (job metadata)
              |-- Cloud Trace / OTLP (distributed tracing)
```

## Local development

```bash
nvm use            # Node 22 (from .nvmrc)
npm install
npm run dev        # http://localhost:4321
```

Without `PUBLIC_TURNSTILE_SITE_KEY` and `PUBLIC_AWS_SERVERLESS_API` env vars, the resume generator and inference widget run in mock mode instead of calling the deployed API.

## Build and test

```bash
npm run build      # builds Mushbot standalone + Astro static site to dist/
npm run test:e2e   # Playwright tests against built site
npm run test:ci    # full CI pipeline: verify Observable, build, E2E tests
```

## Deployment

### Site (GitHub Pages)

Automated via `.github/workflows/deploy-pages.yml` on push to `main`.

Deploy output includes `dist/.nojekyll` so GitHub Pages does not strip underscore-prefixed Observable assets (`/observable/_npm`, `/observable/_observablehq`, etc.).

The workflow needs these GitHub Actions **variables** (Settings > Secrets and variables > Actions > Variables):

| Variable | Description |
|---|---|
| `PUBLIC_AWS_SERVERLESS_API` | Shared API Gateway base URL for Turnstile, resume, and inference (e.g. `https://xyz.execute-api.us-east-1.amazonaws.com/prod`) |
| `PUBLIC_TURNSTILE_SITE_KEY` | Cloudflare Turnstile site key (public) |

These are baked into the static JS at build time via Astro's `import.meta.env`.

### Infrastructure (Terraform)

The `infra/` directory contains Terraform for the API Gateway, WAF, Turnstile broker, session authorizer, and route wiring. See [infra/README.md](infra/README.md) for full details.

Quick start:

```bash
# Authenticate
aws sso login --profile juliusm-prod

# Configure
cp infra/examples/prod.tfvars.example infra/prod.tfvars
# Edit prod.tfvars with your Lambda ARNs and secret ARNs

# Apply
terraform -chdir=infra init
terraform -chdir=infra plan -var-file=prod.tfvars
terraform -chdir=infra apply -var-file=prod.tfvars
```

CI workflows: `infra-plan.yml` runs on PRs, `infra-apply.yml` runs on merge to `main`.

### Resume Lambda (separate repo)

The resume lambda lives in a separate SAM project (`resume_lambda/`). It has its own HTTP API for direct testing, but production traffic goes through the Terraform-managed REST API.

```bash
cd /path/to/resume_lambda
sam build --use-container
sam deploy
```

The Terraform stack needs the resume lambda's ARN in `resume_lambda_arn` to wire it into the API Gateway. All SAM parameters, GCP configuration, and Lambda environment variables are managed in the resume lambda's own `template.yaml`.

#### Resume Lambda dependencies

The resume lambda writes job artifacts (requests, markdown, PDFs) to S3 and stores job metadata in **Cloud SQL Postgres**. A `JOB_METADATA_BACKEND` env var controls the metadata path:

| Backend | Reads from | Writes to | Use case |
|---|---|---|---|
| `s3` | S3 | S3 | Default, no GCP dependency |
| `dual` | S3 | S3 + Postgres | Staging canary — proves Postgres writes without affecting reads |
| `postgres` | Postgres | Postgres | Full cutover to Cloud SQL |

The lambda connects to Cloud SQL via the **Cloud SQL Python Connector** (not a raw IP), so the Lambda runtime needs Google ADC/WIF credentials in addition to the DB username and password.

Distributed tracing is exported over **OTLP** to a configurable collector endpoint (Cloud Trace, Langfuse, or both via a fan-out collector). Both the orchestrator and worker Lambdas emit spans.

## Secrets

All secrets live in AWS Secrets Manager or are passed as SAM parameters. Never commit secrets to git.

| Secret | Used by | Managed in | Format |
|---|---|---|---|
| Turnstile secret | Turnstile broker Lambda | Secrets Manager (this repo's Terraform) | `{"turnstile_secret":"..."}` |
| Session signing key | Turnstile broker + session authorizer | Secrets Manager (this repo's Terraform) | `{"session_signing_key":"..."}` |
| Anthropic API key | Resume Lambda | Secrets Manager (resume lambda SAM) | `{"ANTHROPIC_API_KEY":"..."}` |
| GCP Postgres password | Resume Lambda (orchestrator) | SAM parameter (`GcpPostgresDbPassword`) | Plain string |
| GCP ADC / WIF credentials | Resume Lambda (orchestrator) | Lambda execution role + GCP WIF config | IAM-based, no stored secret |
| OTLP collector headers | Resume Lambda (both) | SAM parameter (`ResumeOtelCollectorHeaders`) | `key=value,key2=value2` |

## Project structure

```
src/
  layouts/BaseLayout.astro     -- shared layout with nav header + footer
  pages/index.astro            -- landing page
  pages/resume.astro           -- resume generator page
  components/resume/           -- ResumeGenerator Svelte component + API client
  components/mushbot/          -- Mushbot chatbot (Svelte)
  lib/turnstile.ts             -- shared Cloudflare Turnstile client
  styles/theme-tokens.css      -- design system tokens

public/observable/             -- Observable Framework static exports (project writeups)

infra/                         -- Terraform: API Gateway, WAF, Lambdas, IAM, secrets
  lambdas/turnstile_broker/    -- Turnstile verification + JWT minting
  lambdas/session_authorizer/  -- JWT validation for API Gateway authorizer

tests/e2e/                     -- Playwright E2E tests
scripts/                       -- build helpers, Observable post-processing, infra scripts
.github/workflows/             -- CI, deploy, infra plan/apply, secret scanning
```
