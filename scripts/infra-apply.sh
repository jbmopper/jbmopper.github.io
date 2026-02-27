#!/usr/bin/env bash
set -euo pipefail

TFVARS_FILE="${1:-}"

terraform -chdir=infra init -input=false

if [[ -n "${TFVARS_FILE}" ]]; then
  terraform -chdir=infra apply -input=false -var-file "${TFVARS_FILE}"
else
  terraform -chdir=infra apply -input=false
fi
