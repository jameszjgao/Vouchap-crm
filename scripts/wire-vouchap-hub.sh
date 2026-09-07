#!/usr/bin/env bash
# Fetch Hub + Vouchap API keys, write CRM .env, set Function secrets, migrate ops.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
mkdir -p .local

npx supabase projects api-keys --project-ref glwacznypahmlpwottfz -o env > .local/hub.env
npx supabase projects api-keys --project-ref giuacjbfsyrristkigmz -o env > .local/vouchap.env

strip_quotes() { sed -n "s/^$1=//p" "$2" | sed -e 's/^"//' -e 's/"$//' -e "s/^'//" -e "s/'$//"; }
hub_anon="$(strip_quotes SUPABASE_ANON_KEY .local/hub.env)"
hub_service="$(strip_quotes SUPABASE_SERVICE_ROLE_KEY .local/hub.env)"
vch_service="$(strip_quotes SUPABASE_SERVICE_ROLE_KEY .local/vouchap.env)"

if [[ -z "$hub_anon" || -z "$hub_service" || -z "$vch_service" ]]; then
  echo "failed to read API keys" >&2
  exit 1
fi

cat > .env <<EOF
VITE_SUPABASE_URL=https://glwacznypahmlpwottfz.supabase.co
VITE_SUPABASE_ANON_KEY=$hub_anon
EOF

if npx supabase secrets set --project-ref glwacznypahmlpwottfz \
  VOUCHAP_SUPABASE_URL=https://giuacjbfsyrristkigmz.supabase.co \
  VOUCHAP_SERVICE_ROLE_KEY="$vch_service"; then
  echo "function secrets set"
else
  echo "function secrets skipped (will use crm.product_adapters)"
fi

export HUB_URL=https://glwacznypahmlpwottfz.supabase.co
export HUB_SERVICE_ROLE_KEY="$hub_service"
export VOUCHAP_URL=https://giuacjbfsyrristkigmz.supabase.co
export VOUCHAP_SERVICE_ROLE_KEY="$vch_service"

node scripts/activate-vouchap-on-hub.mjs
echo "wired Hub .env + Vouchap adapter + ops copy"
