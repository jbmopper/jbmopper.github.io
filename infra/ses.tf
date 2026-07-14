# Easy DKIM validates the whole domain, including no-reply@juliusm.com. Custom
# MAIL FROM and DMARC policy are intentionally separate follow-up work: neither
# is required to validate the SES sender identity safely.
resource "aws_sesv2_email_identity" "domain" {
  count = var.enable_ses_domain_identity ? 1 : 0

  email_identity = var.ses_domain

  dkim_signing_attributes {
    next_signing_key_length = "RSA_2048_BIT"
  }
}

# A failed west-2 domain identity predates this stack. Adopt it instead of
# attempting a duplicate create; publishing the generated DKIM records lets
# SES re-evaluate the existing identity.
import {
  for_each = var.enable_ses_domain_identity ? toset([var.ses_domain]) : toset([])

  to = aws_sesv2_email_identity.domain[0]
  id = each.value
}

resource "cloudflare_dns_record" "ses_dkim" {
  count = var.enable_ses_domain_identity ? 3 : 0

  zone_id = var.cloudflare_zone_id
  name    = "${aws_sesv2_email_identity.domain[0].dkim_signing_attributes[0].tokens[count.index]}._domainkey.${var.ses_domain}"
  type    = "CNAME"
  content = "${aws_sesv2_email_identity.domain[0].dkim_signing_attributes[0].tokens[count.index]}.dkim.amazonses.com"
  proxied = false
  ttl     = 1
  comment = "SES Easy DKIM signing token"
}
