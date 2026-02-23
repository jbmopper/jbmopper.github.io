#!/usr/bin/env bash
set -euo pipefail

TFVARS_FILE="${1:-}"

terraform -chdir=infra init -input=false
terraform -chdir=infra fmt -recursive
terraform -chdir=infra validate

if [[ -n "${TFVARS_FILE}" ]]; then
  terraform -chdir=infra plan -input=false -var-file "${TFVARS_FILE}"
else
  terraform -chdir=infra plan -input=false
fi
