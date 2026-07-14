terraform {
  backend "s3" {
    bucket       = "juliusm-terraform-state-287998774376-us-west-2"
    key          = "juliusm-site/prod/terraform.tfstate"
    region       = "us-west-2"
    encrypt      = true
    use_lockfile = true
  }
}
