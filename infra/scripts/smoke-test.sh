#!/usr/bin/env bash
# Post-deploy checks through the public URL (CL-04, CL-05, CL-07 acceptance criteria).
set -euo pipefail
source "$(dirname "$0")/lib.sh"

app_url="$(output web AppUrl)"
api_endpoint="$(output api ApiEndpoint)"
failures=0

pass() { echo "ok   - $1"; }
fail() { echo "FAIL - $1"; failures=$((failures + 1)); }
status_of() { curl -s -o "${2:-/dev/null}" -w '%{http_code}' "$1"; }

# CloudFront can take a moment to serve the new configuration.
for attempt in {1..10}; do
  [[ "$(status_of "$app_url/api/v1/health")" == "200" ]] && break
  echo "waiting for $app_url (attempt $attempt)"; sleep 15
done

[[ "$(status_of "$app_url/")" == "200" ]] && pass "SPA is served" || fail "SPA is served"
curl -fsS "$app_url/api/v1/health" | jq -e '.status == "ok" and .database == "up"' >/dev/null \
  && pass "health through CloudFront" || fail "health through CloudFront"
curl -fsS "$app_url/api/v1/products" | jq -e '(.items | length) >= 1' >/dev/null \
  && pass "catalog has products" || fail "catalog has products"

body="$(mktemp)"
[[ "$(status_of "$app_url/api/v1/products/00000000-0000-4000-8000-000000000000" "$body")" == "404" ]] \
  && jq -e '.code == "PRODUCT_NOT_FOUND"' "$body" >/dev/null \
  && pass "API 404 stays JSON (no SPA fallback)" || fail "API 404 stays JSON (no SPA fallback)"
curl -fsS "$app_url/transactions/a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d" | grep -q '<div id="root">' \
  && pass "SPA deep link returns index.html" || fail "SPA deep link returns index.html"
[[ "$(status_of "$api_endpoint/api/v1/health")" == "403" ]] \
  && pass "direct API Gateway call is rejected" || fail "direct API Gateway call is rejected"

headers="$(curl -sI "$app_url/")"
for header in strict-transport-security content-security-policy x-content-type-options x-frame-options referrer-policy; do
  grep -qi "^$header:" <<<"$headers" && pass "header $header" || fail "header $header"
done

if ((failures > 0)); then
  echo "::error::$failures smoke check(s) failed"
  exit 1
fi
echo "All smoke checks passed for $app_url"
