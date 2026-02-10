-- ============================================================
-- SKU & add-on seed (Trial + 4 VCH tiers + Data Refill Pack)
-- Codes: VCH_TRIAL | VCH_BASIC | VCH_BIZ | VCH_FLOW | VCH_ELITE. Add-on: VCH_ADDON_500 ($20/500 entries).
-- VCH_TRIAL: all 4 modules, 2 members, 50 vouchers/mo, 15-day validity on registration.
-- ============================================================

-- 1. Free Trial + four VCH SKU tiers
INSERT INTO crm.sku_edition (code, name, description, feature_modules, data_limits, period_type, quota_period, price_monthly, currency, is_trial, sort_order)
VALUES
  (
    'VCH_TRIAL',
    'Free Trial',
    'Free trial. 2 members max. All 4 modules. 50 total vouchers/mo. Valid 15 days. Applied on registration.',
    '{"expenses": true, "income": true, "inbound": true, "outbound": true}'::jsonb,
    '{"members": 2, "total_vouchers_per_month": 50, "expenses_per_month": 50, "income_per_month": 50, "inbound_per_month": 50, "outbound_per_month": 50}'::jsonb,
    'month',
    'month',
    NULL,
    'USD',
    true,
    0
  ),
  (
    'VCH_BASIC',
    'Personal',
    'Individuals & Families. Free. 2 members | 200 total vouchers/mo. Income & Expenses.',
    '{"expenses": true, "income": true, "inbound": false, "outbound": false}'::jsonb,
    '{"members": 2, "total_vouchers_per_month": 200, "expenses_per_month": 200, "income_per_month": 200, "inbound_per_month": 0, "outbound_per_month": 0}'::jsonb,
    'month',
    'month',
    NULL,
    'USD',
    true,
    5
  ),
  (
    'VCH_BIZ',
    'Business',
    'Freelancers & Small Teams. $19.99/mo. 20 members | 500 total vouchers/mo. Income & Expenses + Multi-user.',
    '{"expenses": true, "income": true, "inbound": false, "outbound": false}'::jsonb,
    '{"members": 20, "total_vouchers_per_month": 500, "expenses_per_month": 500, "income_per_month": 500, "inbound_per_month": 0, "outbound_per_month": 0}'::jsonb,
    'month',
    'month',
    19.99,
    'USD',
    false,
    15
  ),
  (
    'VCH_FLOW',
    'Smart Flow',
    'Wholesalers & Trade Agents. $99.99/mo. 5 members | 1,000 total vouchers/mo. AI-Inbound & Outbound.',
    '{"expenses": false, "income": false, "inbound": true, "outbound": true}'::jsonb,
    '{"members": 5, "total_vouchers_per_month": 1000, "expenses_per_month": 0, "income_per_month": 0, "inbound_per_month": 1000, "outbound_per_month": 1000}'::jsonb,
    'month',
    'month',
    99.99,
    'USD',
    false,
    25
  ),
  (
    'VCH_ELITE',
    'Enterprise Pro',
    'Scale-up Businesses. $199.99/mo. Unlimited members | 2,500 total vouchers/mo. Full Suite + Priority Support.',
    '{"expenses": true, "income": true, "inbound": true, "outbound": true}'::jsonb,
    '{"members": 999999, "total_vouchers_per_month": 2500, "expenses_per_month": 2500, "income_per_month": 2500, "inbound_per_month": 2500, "outbound_per_month": 2500}'::jsonb,
    'month',
    'month',
    199.99,
    'USD',
    false,
    35
  )
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  feature_modules = EXCLUDED.feature_modules,
  data_limits = EXCLUDED.data_limits,
  period_type = EXCLUDED.period_type,
  quota_period = EXCLUDED.quota_period,
  price_monthly = EXCLUDED.price_monthly,
  currency = EXCLUDED.currency,
  is_trial = EXCLUDED.is_trial,
  sort_order = EXCLUDED.sort_order,
  updated_at = now();

-- 2. Add-on: Data Refill Pack — $20 / 500 entries
INSERT INTO crm.sku_addon (code, name, description, units, price, currency, is_active, sort_order)
VALUES (
  'VCH_ADDON_500',
  'Data Refill Pack',
  '$20.00 / 500 entries.',
  500,
  20.00,
  'USD',
  true,
  0
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
