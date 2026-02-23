#!/usr/bin/env bash
set -euo pipefail

PROFILE="${1:-default}"

echo "Logging into AWS SSO profile: ${PROFILE}"
aws sso login --profile "${PROFILE}"

echo "AWS caller identity for ${PROFILE}:"
aws sts get-caller-identity --profile "${PROFILE}"
