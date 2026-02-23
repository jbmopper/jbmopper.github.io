#!/usr/bin/env bash
set -euo pipefail

python3 -m unittest discover -s infra/lambdas/tests -p 'test_*.py' -v
