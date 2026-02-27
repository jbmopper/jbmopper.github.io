# TODO

## Resume generator -- remaining integration

- [ ] Create Cloudflare Turnstile widget (dash.cloudflare.com/turnstile) and obtain site key + secret key
- [ ] Store Turnstile secret in AWS Secrets Manager and populate the secret value
- [ ] Generate a random session signing key and store in Secrets Manager
- [ ] Deploy the resume lambda (`sam build && sam deploy`) and note the function ARN
- [ ] Create `infra/prod.tfvars` with `resume_lambda_arn` and secret ARNs, then `terraform apply`
- [ ] Add `PUBLIC_TURNSTILE_SITE_KEY` and `PUBLIC_RESUME_API` as GitHub Actions variables
- [ ] Tighten CORS `AllowOrigins` from `*` to `https://jbmopper.github.io` (and custom domain if applicable)
- [ ] Tighten S3 bucket CORS to the same origins
- [ ] End-to-end test the live flow: Turnstile challenge -> session token -> resume generation -> PDF download
- [ ] Decide whether to remove or restrict the resume lambda's own SAM HTTP API (currently public, no auth)

## Resume generator -- polish

- [ ] Add a "Generating..." substatus that shows which stage the lambda is in (prompt generation, LLM call, PDF render)
- [ ] Add client-side file size validation before upload (3MB limit matches lambda)
- [ ] Add timeout UX -- if polling exceeds 2 minutes, show a more specific message
- [ ] Consider adding a "Preview" step showing extracted JD text before generating

## Session authorizer

- [ ] Add unit tests for the session authorizer lambda (similar to test_turnstile_broker.py)
- [ ] Consider adding action-scoped authorization to chat and infer routes when they're wired up
- [ ] Monitor authorizer cache hit rate and tune `authorizer_cache_ttl_seconds` if needed

## Infrastructure

- [ ] Set up custom domain (`api.juliusm.com`) with ACM certificate and Cloudflare CNAME
- [ ] Add CloudWatch alarms for elevated 4xx/5xx rates and Lambda errors
- [ ] Add a dashboard for API Gateway request volume, latency, and WAF blocks
- [ ] Review WAF rate limits after real traffic data is available
- [ ] Set up secret rotation schedule for signing key and Turnstile secret

## Mushbot chatbot

- [ ] Wire Mushbot to a real backend (Lambda + LLM)
- [ ] Route chatbot traffic through the same API Gateway (`/v1/chat/respond`)
- [ ] Use the session token flow (Turnstile -> JWT -> chat API)
- [ ] Add conversation persistence (server-side state keyed by conversationId)

## Site improvements

- [ ] Add more project writeups
- [ ] Consider a custom domain for the site (juliusm.com)
- [ ] Add Open Graph / social meta tags per page
- [ ] Accessibility audit (keyboard navigation, screen reader, contrast)
