#!/usr/bin/env bash
# Generate a self-signed TLS certificate for local / staging use.
#
# Usage:
#   bash infra/scripts/gen-cert.sh
#
# Output:
#   infra/nginx/certs/sportsgang.crt  (certificate)
#   infra/nginx/certs/sportsgang.key  (private key)
#
# After running this script:
#   1. Uncomment the HTTPS server block in infra/nginx/nginx.conf
#   2. Replace the HTTP proxy block with the HTTP→HTTPS redirect block
#   3. Restart nginx: docker compose restart nginx
set -euo pipefail

CERT_DIR="$(dirname "$0")/../nginx/certs"
mkdir -p "$CERT_DIR"

openssl req -x509 \
  -newkey rsa:4096 \
  -keyout "$CERT_DIR/sportsgang.key" \
  -out    "$CERT_DIR/sportsgang.crt" \
  -days   365 \
  -nodes \
  -subj   "/CN=sportsgang-staging"

echo ""
echo "Certificate written to:"
echo "  $CERT_DIR/sportsgang.crt"
echo "  $CERT_DIR/sportsgang.key"
echo ""
echo "Next: uncomment the HTTPS block in infra/nginx/nginx.conf, then restart nginx."
