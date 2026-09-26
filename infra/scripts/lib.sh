#!/usr/bin/env bash
# Shared helpers for the deploy scripts. Reads values from the `cdk deploy --outputs-file` JSON.
set -euo pipefail

STAGE="${STAGE:-prod}"
OUTPUTS_FILE="${OUTPUTS_FILE:-infra/outputs.json}"

# output <stack suffix> <output key>, e.g. `output api MigrateFunctionName`
output() {
  local value
  value="$(jq -r --arg stack "checkout-${STAGE}-$1" --arg key "$2" '.[$stack][$key] // empty' "$OUTPUTS_FILE")"
  if [[ -z "$value" ]]; then
    echo "Output $2 of checkout-${STAGE}-$1 not found in $OUTPUTS_FILE" >&2
    exit 1
  fi
  printf '%s' "$value"
}
