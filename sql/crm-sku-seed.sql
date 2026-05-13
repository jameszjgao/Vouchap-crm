-- ============================================================
-- CRM SKU / add-on seed (billing model v2026-04)
-- 1) Firm: FIRM_ANNUAL (year fee) + engagement credits (base in data_limits + metadata.engagement_credits_added on orders)
-- 2) Client: CLIENT_RECOGNITION_BASE (catalog-only, free monthly included) + recognition_credits_added on orders / packs
-- 3) Firm–client signing: FIRM_CLIENT_SIGNING_BONUS (catalog-only) + trigger grants credits on first firm.orders per pair
-- Reference add-ons (price 0): list shapes for CRM quoting; not auto-applied.
-- ============================================================

-- Catalog-only rows (not meant as space_orders.sku_id targets)
INSERT INTO crm.sku_edition (
  code, name, description, feature_modules, data_limits, period_type, quota_period,
  price_monthly, price_yearly, currency, is_trial, sort_order
)
VALUES (
  'CLIENT_RECOGNITION_BASE',
  'Client recognition (included tier)',
  'Catalog-only: free included AI recognitions per month for all client spaces.',
  '{"expenses": true, "income": true, "inbound": true, "outbound": true}'::jsonb,
  '{"recognition_included_per_month": 10, "billing_role": "client_catalog"}'::jsonb,
  'forever',
  'month',
  NULL,
  NULL,
  'USD',
  false,
  0
),
(
  'FIRM_CLIENT_SIGNING_BONUS',
  'Firm–client signing bonus (recognition credits)',
  'Catalog-only: credits granted to client space when first firm.orders row is created for each (firm, client) pair.',
  '{"expenses": true, "income": true, "inbound": true, "outbound": true}'::jsonb,
  '{"recognition_credits_per_signing": 20, "billing_role": "policy"}'::jsonb,
  'forever',
  'month',
  NULL,
  NULL,
  'USD',
  false,
  5
)
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  feature_modules = EXCLUDED.feature_modules,
  data_limits = EXCLUDED.data_limits,
  period_type = EXCLUDED.period_type,
  quota_period = EXCLUDED.quota_period,
  price_monthly = EXCLUDED.price_monthly,
  price_yearly = EXCLUDED.price_yearly,
  currency = EXCLUDED.currency,
  is_trial = EXCLUDED.is_trial,
  sort_order = EXCLUDED.sort_order,
  updated_at = now();

-- Firm annual (purchasable order row on firm space)
INSERT INTO crm.sku_edition (
  code, name, description, feature_modules, data_limits, period_type, quota_period,
  price_monthly, price_yearly, currency, is_trial, sort_order
)
VALUES (
  'FIRM_ANNUAL',
  'Firm Annual',
  'Annual firm plan. engagement_credits_included = max concurrent engagements (non-cancelled, non-completed). Top up via order metadata.engagement_credits_added.',
  '{"expenses": true, "income": true, "inbound": true, "outbound": true}'::jsonb,
  '{"engagement_credits_included": 50, "billing_role": "firm"}'::jsonb,
  'year',
  'year',
  NULL,
  99.00,
  'USD',
  false,
  40
)
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  feature_modules = EXCLUDED.feature_modules,
  data_limits = EXCLUDED.data_limits,
  period_type = EXCLUDED.period_type,
  quota_period = EXCLUDED.quota_period,
  price_monthly = EXCLUDED.price_monthly,
  price_yearly = EXCLUDED.price_yearly,
  currency = EXCLUDED.currency,
  is_trial = EXCLUDED.is_trial,
  sort_order = EXCLUDED.sort_order,
  updated_at = now();

INSERT INTO crm.sku_addon (code, name, description, units, price, currency, is_active, sort_order)
VALUES
  (
    'ENGAGEMENT_CREDITS_REF',
    'Engagement credits (reference pack)',
    'Reference: engagement credits sold with firm billing. Grant capacity via space_orders.metadata.engagement_credits_added.',
    10,
    0,
    'USD',
    true,
    10
  ),
  (
    'CLIENT_RECOGNITION_CREDITS_REF',
    'Client recognition credits (reference pack)',
    'Reference: prepaid recognition credits. Grant via space_orders.metadata.recognition_credits_added.',
    100,
    0,
    'USD',
    true,
    20
  )
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  units = EXCLUDED.units,
  price = EXCLUDED.price,
  currency = EXCLUDED.currency,
  is_active = EXCLUDED.is_active,
  sort_order = EXCLUDED.sort_order,
  updated_at = now();
