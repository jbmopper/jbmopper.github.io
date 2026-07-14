# Terraform owns the tunnel object, its remotely managed ingress policy, and
# public DNS. It deliberately does not read the connector token: that token is
# fetched directly from Cloudflare into Doppler after apply, so it cannot enter
# a plan, output, or Terraform state.
resource "cloudflare_zero_trust_tunnel_cloudflared" "arch_ingress" {
  count = var.enable_cloudflare_tunnel ? 1 : 0

  account_id = var.cloudflare_account_id
  name       = var.cloudflare_tunnel_name
  config_src = "cloudflare"

  lifecycle {
    prevent_destroy = true
  }
}

resource "cloudflare_zero_trust_tunnel_cloudflared_config" "arch_ingress" {
  count = var.enable_cloudflare_tunnel ? 1 : 0

  account_id = var.cloudflare_account_id
  tunnel_id  = cloudflare_zero_trust_tunnel_cloudflared.arch_ingress[0].id
  source     = "cloudflare"

  config = {
    ingress = concat(
      [
        for route in [
          { path = "^/\\.well-known/oauth-protected-resource/mcp$", service = var.mcp_origin_url },
          { path = "^/\\.well-known/oauth-authorization-server$", service = var.mcp_origin_url },
          { path = "^/oauth/register$", service = var.mcp_origin_url },
          { path = "^/oauth/authorize$", service = var.mcp_origin_url },
          { path = "^/oauth/token$", service = var.mcp_origin_url },
          { path = "^/mcp$", service = var.mcp_origin_url },
          { path = "^/readyz$", service = var.mcp_origin_url },
          ] : {
          hostname = var.mcp_public_hostname
          path     = route.path
          service  = route.service
        }
      ],
      [{ hostname = var.mcp_public_hostname, service = "http_status:404" }],
      [
        for hostname, service in var.cloudflare_additional_tunnel_routes : {
          hostname = hostname
          service  = service
        }
      ],
      [{ service = "http_status:404" }]
    )
  }
}

resource "cloudflare_dns_record" "tunnel" {
  for_each = var.enable_cloudflare_tunnel ? local.tunnel_routes : {}

  zone_id = var.cloudflare_zone_id
  name    = each.key
  type    = "CNAME"
  content = "${cloudflare_zero_trust_tunnel_cloudflared.arch_ingress[0].id}.cfargotunnel.com"
  proxied = true
  ttl     = 1
  comment = each.key == var.mcp_public_hostname ? "Public Meristem MCP provider edge; no Cloudflare Access" : "Cloudflare Tunnel route managed by Terraform"
}

# A zone has only one entry-point ruleset for this phase. Import any existing
# http_ratelimit ruleset before enabling this resource; Terraform will own the
# complete rule list. Three rules require a Cloudflare plan that supports them.
resource "cloudflare_ruleset" "mcp_oauth_rate_limits" {
  count = var.enable_cloudflare_rate_limits ? 1 : 0

  zone_id     = var.cloudflare_zone_id
  name        = "Meristem MCP OAuth endpoint rate limits"
  description = "Per-IP ceilings required by the public provider gateway"
  kind        = "zone"
  phase       = "http_ratelimit"

  rules = [
    {
      action      = "block"
      description = "Limit dynamic OAuth client registrations to 5/min/IP"
      enabled     = true
      expression  = "(http.host eq \"${var.mcp_public_hostname}\" and http.request.method eq \"POST\" and http.request.uri.path eq \"/oauth/register\")"
      ref         = "meristem_oauth_register"
      ratelimit = {
        characteristics     = ["cf.colo.id", "ip.src"]
        period              = 60
        requests_per_period = 5
        mitigation_timeout  = 60
      }
    },
    {
      action      = "block"
      description = "Limit OAuth authorization requests to 30/min/IP"
      enabled     = true
      expression  = "(http.host eq \"${var.mcp_public_hostname}\" and http.request.method eq \"GET\" and http.request.uri.path eq \"/oauth/authorize\")"
      ref         = "meristem_oauth_authorize"
      ratelimit = {
        characteristics     = ["cf.colo.id", "ip.src"]
        period              = 60
        requests_per_period = 30
        mitigation_timeout  = 60
      }
    },
    {
      action      = "block"
      description = "Limit OAuth token requests to 60/min/IP"
      enabled     = true
      expression  = "(http.host eq \"${var.mcp_public_hostname}\" and http.request.method eq \"POST\" and http.request.uri.path eq \"/oauth/token\")"
      ref         = "meristem_oauth_token"
      ratelimit = {
        characteristics     = ["cf.colo.id", "ip.src"]
        period              = 60
        requests_per_period = 60
        mitigation_timeout  = 60
      }
    }
  ]
}
