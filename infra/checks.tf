# Unlike a top-level check block, resource preconditions stop plan/apply. This
# guard prevents partially configured public ingress or unverifiable SES state.
resource "terraform_data" "configuration_guard" {
  input = "configuration-guard-v1"

  lifecycle {
    precondition {
      condition = !var.enable_cloudflare_tunnel || (
        trimspace(var.cloudflare_account_id) != "" &&
        trimspace(var.cloudflare_zone_id) != "" &&
        endswith(var.mcp_public_hostname, ".${var.cloudflare_zone_name}")
      )
      error_message = "Tunnel management requires Cloudflare account/zone IDs and an MCP hostname in cloudflare_zone_name."
    }

    precondition {
      condition     = length(var.cloudflare_additional_tunnel_routes) == 0
      error_message = "cloudflare_additional_tunnel_routes must stay empty for this rollout; publish future services only after an explicit security review and code change."
    }

    precondition {
      condition     = !var.enable_cloudflare_rate_limits || var.enable_cloudflare_tunnel
      error_message = "Cloudflare MCP rate limits require the managed tunnel to be enabled."
    }

    precondition {
      condition = !var.enable_ses_domain_identity || (
        trimspace(var.cloudflare_zone_id) != "" &&
        var.ses_domain == var.cloudflare_zone_name &&
        endswith(var.intake_sender_email, "@${var.ses_domain}")
      )
      error_message = "SES domain management requires a Cloudflare zone ID, matching zone/domain names, and a sender in that domain."
    }

    precondition {
      condition     = !local.intake_route_requested || var.enable_ses_domain_identity
      error_message = "The intake route requires Terraform-managed SES domain validation."
    }
  }
}
