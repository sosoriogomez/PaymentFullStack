#!/usr/bin/env bash
# Runs migrations and the idempotent seed through the migrate Lambda (the database is private).
# Fails the job when the function reports an error.
set -euo pipefail
source "$(dirname "$0")/lib.sh"

function_name="$(output api MigrateFunctionName)"
result="$(mktemp)"
metadata="$(mktemp)"

aws lambda invoke \
  --function-name "$function_name" \
  --payload '{}' \
  --cli-binary-format raw-in-base64-out \
  --cli-read-timeout 310 \
  "$result" >"$metadata"

if jq -e '.FunctionError' "$metadata" >/dev/null; then
  echo "::error::Migration failed"
  cat "$result"
  exit 1
fi
echo "Migration report: $(cat "$result")"
