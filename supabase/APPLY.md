# Apply Adaven-CRM Hub (project `glwacznypahmlpwottfz` only)

Do **not** run these files on Vouchap (`giuacjbfsyrristkigmz`), Portalflow, Wholestore, or aim.link.

## Project

| | |
|---|---|
| Ref | `glwacznypahmlpwottfz` |
| URL | `https://glwacznypahmlpwottfz.supabase.co` |
| Repo | `Adaven-CRM` (package `adaven-crm`) |

## Schema

From this repo:

```bash
npx supabase link --project-ref glwacznypahmlpwottfz
npx supabase db push --linked
```

Or SQL Editor: `sql/adaven-crm-hub.sql` / `supabase/migrations/20260904170000_adaven_crm_hub.sql`.

Then **Settings → API → Exposed schemas**: `public, crm`.

## Edge Functions

```bash
npx supabase functions deploy product-ops --project-ref glwacznypahmlpwottfz
npx supabase functions deploy sync-crm-role --project-ref glwacznypahmlpwottfz
npx supabase functions deploy ops-auth --project-ref glwacznypahmlpwottfz
```

Secrets (product **service role** only — never in Vite; product **anon** keys are not used by Hub). If the CLI account cannot write Function secrets (403), store the same values in Hub `crm.product_adapters` (service_role only). `scripts/activate-vouchap-on-hub.mjs` upserts Vouchap; `scripts/upsert-product-adapters.mjs` upserts any product whose `*_URL` / `*_SERVICE_ROLE_KEY` are in the environment. `product-ops` reads Function secrets first, then this table.

| Secret | Points at |
|--------|-----------|
| `VOUCHAP_SUPABASE_URL` / `VOUCHAP_SERVICE_ROLE_KEY` | `giuacjbfsyrristkigmz` |
| `PORTALFLOW_SUPABASE_URL` / `PORTALFLOW_SERVICE_ROLE_KEY` | `xvqlqvtfogxkfeillvig` |
| `WHOLESTORE_SUPABASE_URL` / `WHOLESTORE_SERVICE_ROLE_KEY` | `foyecolycmxcneflpant` |
| `AIMLINK_SUPABASE_URL` / `AIMLINK_SERVICE_ROLE_KEY` | `ychcuxqggqceaodhoutv` |

```bash
npx supabase secrets set \
  VOUCHAP_SUPABASE_URL=https://giuacjbfsyrristkigmz.supabase.co \
  PORTALFLOW_SUPABASE_URL=https://xvqlqvtfogxkfeillvig.supabase.co \
  WHOLESTORE_SUPABASE_URL=https://foyecolycmxcneflpant.supabase.co \
  AIMLINK_SUPABASE_URL=https://ychcuxqggqceaodhoutv.supabase.co \
  --project-ref glwacznypahmlpwottfz
# then set the four *_SERVICE_ROLE_KEY values the same way
```

## Vouchap privilege (no table / app change)

The historical Vouchap CRM SQL granted `crm.space_orders` to `authenticated` only. Hub `product-ops` uses the Vouchap **service role**, so run this once on project `giuacjbfsyrristkigmz` (SQL Editor or):

```bash
npx supabase db query --project-ref giuacjbfsyrristkigmz -f sql/grant-vouchap-service-role-for-hub.sql
```

## Activate Vouchap ops on Hub (does not write to Vouchap)

```bash
bash scripts/wire-vouchap-hub.sh
```

This writes local `.env` (Hub anon only), copies `crm.ops_users` / assignments / follow-ups onto Hub Auth, and upserts the Vouchap adapter. Temporary passwords for **newly created** Hub users are in `.local/ops-bootstrap.json` (gitignored).

Or run `node scripts/activate-vouchap-on-hub.mjs` after exporting `HUB_URL`, `HUB_SERVICE_ROLE_KEY`, `VOUCHAP_URL`, `VOUCHAP_SERVICE_ROLE_KEY`.

## First ops user (manual)

1. Auth → create user (email/password).
2. SQL:

```sql
INSERT INTO crm.ops_users (user_id, email, name, role)
SELECT id, email, raw_user_meta_data->>'name', 'admin'
FROM auth.users WHERE email = 'ops@example.com';
```

Copy Vouchap assignments with `sql/migrate-vouchap-ops-to-hub.sql`.

## Frontend

`.env`:

```
VITE_SUPABASE_URL=https://glwacznypahmlpwottfz.supabase.co
VITE_SUPABASE_ANON_KEY=<Hub anon public key>
```

`npm run dev` → http://localhost:5174

Hub 与 Vouchap 产品登录不是同一套密码。本地改某个运营 Hub 密码：

```bash
HUB_URL=https://glwacznypahmlpwottfz.supabase.co \
HUB_SERVICE_ROLE_KEY=... HUB_ANON_KEY=... \
OPS_EMAIL=ops@example.com OPS_PASSWORD='...' \
node scripts/set-hub-ops-password.mjs
```
