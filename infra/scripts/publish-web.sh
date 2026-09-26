#!/usr/bin/env bash
# Uploads the SPA build with a cache policy per kind of file and refreshes index.html at the edge.
#   assets/*    content-hashed by Vite  -> cached for a year, immutable (old hashes are kept for
#                                          clients that still hold the previous index.html)
#   index.html  entry point             -> no-cache (always revalidated)
#   the rest    images, favicon         -> one day
set -euo pipefail
source "$(dirname "$0")/lib.sh"

DIST_DIR="${DIST_DIR:-apps/web/dist}"
bucket="$(output web WebBucketName)"
distribution="$(output web DistributionId)"

aws s3 sync "$DIST_DIR/assets" "s3://$bucket/assets" --cache-control "public,max-age=31536000,immutable"
aws s3 sync "$DIST_DIR" "s3://$bucket" --delete --exclude "assets/*" --exclude "index.html" \
  --cache-control "public,max-age=86400"
aws s3 cp "$DIST_DIR/index.html" "s3://$bucket/index.html" --cache-control "no-cache" --content-type "text/html"
aws cloudfront create-invalidation --distribution-id "$distribution" --paths "/index.html" "/" >/dev/null
echo "Published $DIST_DIR to s3://$bucket and invalidated /index.html"
