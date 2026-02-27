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
```

## Local development

```bash
nvm use            # Node 22 (from .nvmrc)
npm install
npm run dev        # http://localhost:4321
```

Without `PUBLIC_TURNSTILE_SITE_KEY` and `PUBLIC_RESUME_API` env vars, the resume generator runs in mock mode (simulated responses, no real API calls).

## Build and test

```bash
npm run build      # builds Mushbot standalone + Astro static site to dist/
npm run test:e2e   # Playwright tests against built site
npm run test:ci    # full CI pipeline: verify Observable, build, E2E tests
```

## Deployment

### Site (GitHub Pages)

Automated via `.github/workflows/deploy-pages.yml` on push to `main`.

The workflow needs these GitHub Actions **variables** (Settings > Secrets and variables > Actions > Variables):

| Variable | Description |
|---|---|
| `PUBLIC_TURNSTILE_SITE_KEY` | Cloudflare Turnstile site key (public) |
| `PUBLIC_RESUME_API` | API Gateway base URL (e.g. `https://xyz.execute-api.us-east-1.amazonaws.com/prod`) |

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

The resume lambda lives at `/resume_lambda` (separate SAM project). It has its own HTTP API for direct testing, but production traffic goes through the Terraform-managed REST API.

```bash
cd /path/to/resume_lambda
sam build --use-container
sam deploy
```

The Terraform stack needs the resume lambda's ARN in `resume_lambda_arn` to wire it into the API Gateway.

## Secrets

All secrets live in AWS Secrets Manager. Never commit secrets to git.

| Secret | Used by | Format |
|---|---|---|
| Turnstile secret | Turnstile broker Lambda | `{"turnstile_secret":"..."}` |
| Session signing key | Turnstile broker + session authorizer | `{"session_signing_key":"..."}` |
| Anthropic API key | Resume Lambda | `{"ANTHROPIC_API_KEY":"..."}` |

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
  lambdas/modal_inference_proxy/ -- optional Modal GPU proxy

tests/e2e/                     -- Playwright E2E tests
scripts/                       -- build helpers, Observable post-processing, infra scripts
.github/workflows/             -- CI, deploy, infra plan/apply, secret scanning
```
