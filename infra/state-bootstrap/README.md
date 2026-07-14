# Terraform state bootstrap

This small stack uses local state to create the versioned, encrypted, private
S3 bucket that backs the main production stack. It must remain separate from
the state it creates.

Run it once with the production AWS identity:

```bash
terraform -chdir=infra/state-bootstrap init
terraform -chdir=infra/state-bootstrap plan
terraform -chdir=infra/state-bootstrap apply
```

Then freeze all other applies and migrate the authoritative local state exactly
once:

```bash
terraform -chdir=infra init -migrate-state
doppler run --project juliusm-infra --config prd -- terraform -chdir=infra plan
```

Review that migration plan for zero destroys or replacements before resuming
applies. Do not delete the old local state backup until the remote state and
S3 object versions have been verified. Backend credentials belong in the AWS
credential chain, never in backend arguments or committed files.

The production Terraform role should have only `s3:ListBucket` on the bucket
with prefix `juliusm-site/prod/terraform.tfstate*`, `s3:GetObject` and
`s3:PutObject` on the state object, and `s3:GetObject`, `s3:PutObject`, and
`s3:DeleteObject` on the lock object:

- `juliusm-site/prod/terraform.tfstate`
- `juliusm-site/prod/terraform.tfstate.tflock`

Do not grant the CI role access to unrelated state objects.
