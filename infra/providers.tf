provider "aws" {
  region = var.aws_region

  default_tags {
    tags = local.common_tags
  }
}

# Auth comes from the CLOUDFLARE_API_TOKEN environment variable, sourced from
# Doppler at plan/apply time (`doppler run -- terraform apply ...`). The token
# must never appear in tfvars or state.
provider "cloudflare" {}
