# Production edge and API infrastructure

This stack manages the existing AWS API security layer, the public Meristem MCP
edge through Cloudflare Tunnel, and SES validation for
`no-reply@juliusm.com`. The deployed AWS stack and SES identity live in
`us-west-2`.

## Meristem provider edge

With `enable_cloudflare_tunnel = true`, Terraform owns:

- a remotely configured Cloudflare Tunnel;
- proxied DNS for `mcp.juliusm.com`;
- only the documented public routes:
  - `GET /.well-known/oauth-protected-resource/mcp`
  - `GET /.well-known/oauth-authorization-server`
  - `POST /oauth/register`
  - `GET /oauth/authorize`
  - `POST /oauth/token`
  - `GET` and `POST /mcp`
  - `GET /readyz`
- a hostname catch-all and final tunnel catch-all that return 404;
- an optional native Cloudflare three-rule ruleset, disabled on the current
  Free plan because that plan cannot express the required method-aware rules.

No Cloudflare Access application is attached. Provider connectors reach plain
public HTTPS and Meristem performs OAuth-compatible authentication itself.
Cloudflare forwards the allowed paths to a loopback-only nginx edge on
`127.0.0.1:8081`; Meristem itself stays on `127.0.0.1:8080`. The edge strictly
paces the three per-client OAuth routes at 5/30/60 requests per minute with
bursts disabled, using `CF-Connecting-IP`, which is trusted only because both
cloudflared and nginx are confined to loopback on the same single-owner host.
It does not limit `/mcp`, readiness, or discovery routes.
Proxy buffering and request buffering are disabled for MCP Streamable HTTP and
SSE, long read/send timeouts are used, and upstream retry is disabled. Neither
Cloudflare nor nginx may retry or replay OAuth token request bodies: Meristem
revokes the whole grant if an old refresh token is replayed.

The tunnel credential is intentionally absent from Terraform. After the tunnel
exists, an operator retrieves its connector token directly from the Cloudflare
API and writes only that value to the `meristem` Doppler project. The Arch node
materializes it as a root-owned file and runs `cloudflared` with `--token-file`.
Do not use the Terraform tunnel-token data source or output the token.

`cloudflare_additional_tunnel_routes` remains empty. Do not publish
`media.juliusm.com` until a service exists and its authentication contract is
known; an experimental media service should normally get a separate tunnel and
security boundary.

## SES validation

`enable_ses_domain_identity = true` creates the `juliusm.com` SES v2 identity
and publishes three DNS-only Easy DKIM CNAMEs in Cloudflare. This validates
`no-reply@juliusm.com` without requiring that address to receive mail.

SES is currently sandboxed in west-2. `jbmopper@gmail.com` is already verified
there and can receive test mail. Request SES production access before using an
unverified recipient. The west-2 account already contains a failed
`juliusm.com` identity; the configuration imports that identity into
`aws_sesv2_email_identity.domain[0]` and publishes its Easy DKIM records rather
than attempting a duplicate create.

Custom MAIL FROM, SPF, and DMARC policy are intentionally outside this change;
they are not required for domain validation. The intake Lambda may call only
`ses:SendEmail` against the managed identity ARN.

## Remote state migration

The main stack uses the S3 backend in `backend.tf`, with native S3 lockfiles.
Terraform 1.10 or newer is required. Bootstrap the bucket from
`state-bootstrap/` first, then freeze applies and run:

```bash
terraform -chdir=infra init -migrate-state
```

Review a production plan for zero destroys or replacements before any apply.
Keep the local-state backup until the remote object and its S3 versions are
verified. Backend credentials come from the AWS credential chain only.

## Variables and secrets

Use `examples/prod.tfvars.example` only as a names-only reference for the
`TF_VAR_*` keys in Doppler. Production plan/apply does not load a repo-local
tfvars file; this avoids mixing legacy local credentials with authoritative
configuration. Required secret scopes are separate:

- `juliusm-infra/prd`: Cloudflare provider API token and Terraform secret
  inputs used only by trusted apply hosts/CI;
- `meristem/prd`: Cloudflare connector run token and Meristem runtime values
  materialized only on the Arch node.

The Cloudflare provider reads `CLOUDFLARE_API_TOKEN`; sensitive Terraform
variables use `TF_VAR_*`. No token belongs in a committed tfvars file, command
line, Terraform output, or state.

Restrict the provider token to the Juliusm Cloudflare account and
`juliusm.com` zone with only Tunnel read/write and DNS write. Ruleset edit
permission is needed only if a future paid-plan migration enables and imports
the native Cloudflare ruleset. The token is for the trusted Terraform host/CI
only and must never be copied to the Arch node.

The externally deployed production stack retains the historical Terraform
label `environment=dev`; changing it now would rename and replace existing
resources. `stage_name=prod` remains the API stage. A separate migration must
normalize the label later. The production workflow also requires the existing
resume, inference, and chat route inputs to be non-empty. WAF remains explicitly
disabled to preserve the live stack; enabling it is a separate additive scope.
These gates prevent an omitted Doppler key from silently removing a deployed
route or introducing unrelated resources.

`cloudflare_additional_tunnel_routes` is pinned to the JSON value `{}` in
Doppler and by a Terraform precondition. Publishing another hostname requires
an explicit reviewed code change; an injected variable cannot expose a new
service during this rollout.

## Safe local workflow

```bash
terraform -chdir=infra fmt -recursive
terraform -chdir=infra init
terraform -chdir=infra validate
doppler run --project juliusm-infra --config prd -- \
  terraform -chdir=infra plan
```

Reject a production plan containing destroys or replacements. Apply only from
the reviewed plan: the plan workflow records its commit and canonical JSON
SHA-256 without uploading the sensitive plan artifact, and the separately
dispatched apply workflow regenerates the plan and requires both values to
match before applying. Run Lambda tests with:

```bash
./scripts/test-infra-lambdas.sh
```

## Existing API stack

The stack also manages API Gateway, optional WAF, the Turnstile broker and
authorizer Lambdas, Secrets Manager placeholders, and optional resume, intake,
chat, inference, and custom-domain routes. The intake route is enabled only
when sender and recipient values are set and the managed SES domain identity is
enabled.
