#!/usr/bin/env bash
# Stores the payment gateway settings in SSM Parameter Store as SecureString for one stage.
# Values are read from the operator's environment and piped through stdin, so they never appear
# in the repository, in the shell history or in the process list.
#
#   export PG_BASE_URL=... PG_PUBLIC_KEY=... PG_PRIVATE_KEY=... PG_INTEGRITY_SECRET=... PG_EVENTS_SECRET=...
#   STAGE=prod ./infra/scripts/put-parameters.sh
set -euo pipefail

STAGE="${STAGE:-prod}"
PREFIX="/checkout/${STAGE}"

declare -A PARAMETERS=(
  [pg/base-url]=PG_BASE_URL
  [pg/public-key]=PG_PUBLIC_KEY
  [pg/private-key]=PG_PRIVATE_KEY
  [pg/integrity-secret]=PG_INTEGRITY_SECRET
  [pg/events-secret]=PG_EVENTS_SECRET
)

missing=()
for variable in "${PARAMETERS[@]}"; do
  [[ -n "${!variable:-}" ]] || missing+=("$variable")
done
if ((${#missing[@]} > 0)); then
  echo "Missing environment variables: ${missing[*]}" >&2
  exit 1
fi

for suffix in "${!PARAMETERS[@]}"; do
  variable="${PARAMETERS[$suffix]}"
  printf '%s' "${!variable}" |
    aws ssm put-parameter \
      --name "${PREFIX}/${suffix}" \
      --type SecureString \
      --overwrite \
      --value file:///dev/stdin >/dev/null
  echo "stored ${PREFIX}/${suffix}"
done
