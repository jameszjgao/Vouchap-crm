-- ============================================================
-- Vouchap CRM Schema（与主应用同库，独立 crm schema，便于合规与未来分库）
-- 执行于 Supabase SQL Editor
-- ============================================================

CREATE SCHEMA IF NOT EXISTS crm;

-- ------------------------------
-- 1. 运营人员（鉴权：user_id 对应 auth.users，不建 FK 便于未来分库）
-- ------------------------------
CREATE TABLE IF NOT EXISTS crm.ops_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,  -- auth.users.id
  name text,
  email text NOT NULL,
  role text NOT NULL DEFAULT 'ops',  -- admin | ops | sales | support
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ops_users_user_id ON crm.ops_users(user_id);
CREATE INDEX IF NOT EXISTS idx_ops_users_role ON crm.ops_users(role);

COMMENT ON TABLE crm.ops_users IS '运营人员账号，user_id 对应 auth.users.id，仅在此表中的用户可登录 CRM';

-- ------------------------------
-- 2. 审计日志（运营操作可追溯）
-- ------------------------------
CREATE TABLE IF NOT EXISTS crm.ops_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ops_user_id uuid REFERENCES crm.ops_users(id) ON DELETE SET NULL,
  action text NOT NULL,           -- create_order | update_order | assign_customer | ...
  resource_type text NOT NULL,   -- space_order | ops_user | assignment | sku
  resource_id text,
  details jsonb,
  ip_address inet,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ops_audit_log_ops_user ON crm.ops_audit_log(ops_user_id);
CREATE INDEX IF NOT EXISTS idx_ops_audit_log_created ON crm.ops_audit_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ops_audit_log_resource ON crm.ops_audit_log(resource_type, resource_id);

-- ------------------------------
-- 3. 权益包（SKU）：功能模块 + 成员上限 + 周期用量 + 定价
-- 详见 sql/crm-order-design.md
-- ------------------------------
CREATE TABLE IF NOT EXISTS crm.sku_edition (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,     -- VCH_TRIAL | VCH_BASIC | VCH_BIZ | VCH_FLOW | VCH_ELITE
  name text NOT NULL,
  description text,
  -- 功能模块：expenses / income / inbound / outbound，布尔开关
  feature_modules jsonb NOT NULL DEFAULT '{}',
  -- 成员上限 members；总用量 total_vouchers_per_month（当月所有类型凭证合计）；可选 per-type 键
  data_limits jsonb NOT NULL DEFAULT '{}',
  period_type text NOT NULL DEFAULT 'month',  -- 计费周期：month | year | forever
  quota_period text NOT NULL DEFAULT 'month',  -- 用量统计周期，默认按月
  -- 定价：NULL 表示免费
  price_monthly numeric(10, 2),  -- 月价（美元等），NULL=免费
  currency text NOT NULL DEFAULT 'USD',
  is_trial boolean NOT NULL DEFAULT false,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sku_edition_code ON crm.sku_edition(code);
CREATE INDEX IF NOT EXISTS idx_sku_edition_is_trial ON crm.sku_edition(is_trial);
CREATE INDEX IF NOT EXISTS idx_sku_edition_price ON crm.sku_edition(price_monthly) WHERE price_monthly IS NOT NULL;

COMMENT ON TABLE crm.sku_edition IS '权益包/SKU 版本：功能模块(expenses/income/inbound/outbound)、成员上限、周期用量、月价';

-- ------------------------------
-- 3.1 用量增购（每 N 条数据的价格，用于超量增购）
-- ------------------------------
CREATE TABLE IF NOT EXISTS crm.sku_addon (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,     -- VCH_ADDON_500
  name text,
  description text,
  units int NOT NULL,            -- 每多少条为一档，如 100
  price numeric(10, 2) NOT NULL,
  currency text NOT NULL DEFAULT 'USD',
  is_active boolean NOT NULL DEFAULT true,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sku_addon_code ON crm.sku_addon(code);
CREATE INDEX IF NOT EXISTS idx_sku_addon_active ON crm.sku_addon(is_active) WHERE is_active = true;

COMMENT ON TABLE crm.sku_addon IS '用量增购：每 N 条数据的价格，如每 100 条 20 美元';

-- ------------------------------
-- 4. 空间订单（含注册即产生的免费试用订单）
-- 同一 space 多条订单，生效订单 = 按 created_at 最新且 status=active 且未过期
-- 剩余授权时间 = expires_at（NULL 表示永久），业务上剩余 = expires_at - now()
-- ------------------------------
CREATE TABLE IF NOT EXISTS crm.space_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  space_id uuid NOT NULL,        -- public.spaces.id，不建 FK 便于分库
  sku_id uuid NOT NULL REFERENCES crm.sku_edition(id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'active',  -- pending | active | expired | cancelled
  started_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,        -- 授权到期时间，NULL 表示永久
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by_ops_user_id uuid REFERENCES crm.ops_users(id) ON DELETE SET NULL,
  source text NOT NULL DEFAULT 'registration'  -- registration | purchase | ops_grant
);

CREATE INDEX IF NOT EXISTS idx_space_orders_space ON crm.space_orders(space_id);
CREATE INDEX IF NOT EXISTS idx_space_orders_space_created ON crm.space_orders(space_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_space_orders_status ON crm.space_orders(status);
CREATE INDEX IF NOT EXISTS idx_space_orders_expires ON crm.space_orders(expires_at) WHERE expires_at IS NOT NULL;

COMMENT ON TABLE crm.space_orders IS '空间订单；生效订单=同 space 下 created_at 最新且 active 且未过期';

-- ------------------------------
-- 5. 线索分配（每条线索 = 一个空间的创建者，分配给一个运营人员）
-- 每个 space 只能分配给一个运营，在该运营界面列出其负责的所有空间/线索
-- ------------------------------
CREATE TABLE IF NOT EXISTS crm.ops_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ops_user_id uuid NOT NULL REFERENCES crm.ops_users(id) ON DELETE CASCADE,
  space_id uuid NOT NULL UNIQUE,  -- 每空间仅能分配给一个运营
  role text NOT NULL DEFAULT 'primary',
  assigned_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ops_assignments_ops_user ON crm.ops_assignments(ops_user_id);
CREATE INDEX IF NOT EXISTS idx_ops_assignments_space ON crm.ops_assignments(space_id);

COMMENT ON TABLE crm.ops_assignments IS '线索分配：每空间对应一条线索，分配给一个运营人员，运营界面按 ops_user_id 列出';

-- ------------------------------
-- 6. 邀请码（一用户一码，用户首次发起邀请时自动创建）
-- ------------------------------
CREATE TABLE IF NOT EXISTS crm.referral_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,  -- 归属用户（auth.users.id），一用户一码
  referral_code text NOT NULL UNIQUE
);

CREATE INDEX IF NOT EXISTS idx_referral_codes_user ON crm.referral_codes(user_id);
CREATE INDEX IF NOT EXISTS idx_referral_codes_code ON crm.referral_codes(referral_code);

COMMENT ON TABLE crm.referral_codes IS '邀请码：一用户一码，首次发起邀请时自动创建';

-- ------------------------------
-- 7. 邀请关系（被邀请者 user_id + 邀请码 id）
-- ------------------------------
CREATE TABLE IF NOT EXISTS crm.referral_relations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  referee_user_id uuid NOT NULL UNIQUE,   -- 被邀请者（auth.users.id），一人只能被邀请一次
  referrer_code_id uuid NOT NULL REFERENCES crm.referral_codes(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_referral_relations_referee ON crm.referral_relations(referee_user_id);
CREATE INDEX IF NOT EXISTS idx_referral_relations_referrer ON crm.referral_relations(referrer_code_id);

COMMENT ON TABLE crm.referral_relations IS '邀请关系：被邀请者 user_id、邀请码 id';

-- ------------------------------
-- 8. SKU 与用量增购初始化（免费试用 + 4 档 VCH 产品 + Data Refill Pack）
-- 试用 VCH_TRIAL：四模块、2 成员、50 凭证/月，有效期 15 天，注册即添加
-- ------------------------------
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

-- Add-on: Data Refill Pack — $20 / 500 entries
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

-- ------------------------------
-- 9. RLS：仅 service_role 或经校验的 ops 可访问（应用层用 service_role 或后端校验 JWT 后查）
-- 若 CRM 前端直连 Supabase，可对 crm 表启用 RLS，策略为：当前 auth.uid() 在 crm.ops_users 中则允许
-- ------------------------------
ALTER TABLE crm.ops_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm.ops_audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm.sku_edition ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm.sku_addon ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm.space_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm.ops_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm.referral_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm.referral_relations ENABLE ROW LEVEL SECURITY;

-- 辅助函数：返回当前运营用户角色（SECURITY DEFINER 读 crm.ops_users 不触发 RLS，避免 policy 自引用递归 500）
CREATE OR REPLACE FUNCTION crm.current_ops_user_role()
RETURNS text LANGUAGE sql SECURITY DEFINER SET search_path = crm STABLE
AS $$ SELECT role FROM crm.ops_users WHERE user_id = auth.uid() LIMIT 1; $$;
GRANT EXECUTE ON FUNCTION crm.current_ops_user_role() TO authenticated;

-- 删除旧策略以便重复执行不报错
DROP POLICY IF EXISTS ops_users_select_own ON crm.ops_users;
DROP POLICY IF EXISTS ops_users_all_admin ON crm.ops_users;
DROP POLICY IF EXISTS ops_users_admin_all ON crm.ops_users;
DROP POLICY IF EXISTS ops_users_select_ops ON crm.ops_users;
DROP POLICY IF EXISTS ops_audit_log_ops ON crm.ops_audit_log;
DROP POLICY IF EXISTS sku_ops ON crm.sku_edition;
DROP POLICY IF EXISTS sku_addon_ops ON crm.sku_addon;
DROP POLICY IF EXISTS sku_addon_select_authenticated ON crm.sku_addon;
DROP POLICY IF EXISTS space_orders_ops ON crm.space_orders;
DROP POLICY IF EXISTS ops_assignments_ops ON crm.ops_assignments;
DROP POLICY IF EXISTS referral_codes_ops ON crm.referral_codes;
DROP POLICY IF EXISTS referral_relations_ops ON crm.referral_relations;

-- 策略：每人只能看自己的行；admin 用函数判断，避免 policy 内再查 crm.ops_users 导致递归 500
CREATE POLICY ops_users_select_own ON crm.ops_users FOR SELECT USING (user_id = auth.uid());
CREATE POLICY ops_users_admin_all ON crm.ops_users FOR ALL USING (crm.current_ops_user_role() = 'admin');

CREATE POLICY ops_audit_log_ops ON crm.ops_audit_log FOR ALL USING (
  EXISTS (SELECT 1 FROM crm.ops_users WHERE user_id = auth.uid())
);

CREATE POLICY sku_ops ON crm.sku_edition FOR ALL USING (
  EXISTS (SELECT 1 FROM crm.ops_users WHERE user_id = auth.uid())
);

CREATE POLICY sku_addon_ops ON crm.sku_addon FOR ALL USING (
  EXISTS (SELECT 1 FROM crm.ops_users WHERE user_id = auth.uid())
);

CREATE POLICY sku_addon_select_authenticated ON crm.sku_addon
  FOR SELECT USING (is_active = true);

CREATE POLICY space_orders_ops ON crm.space_orders FOR ALL USING (
  EXISTS (SELECT 1 FROM crm.ops_users WHERE user_id = auth.uid())
);

CREATE POLICY ops_assignments_ops ON crm.ops_assignments FOR ALL USING (
  EXISTS (SELECT 1 FROM crm.ops_users WHERE user_id = auth.uid())
);

CREATE POLICY referral_codes_ops ON crm.referral_codes FOR ALL USING (
  EXISTS (SELECT 1 FROM crm.ops_users WHERE user_id = auth.uid())
);

CREATE POLICY referral_relations_ops ON crm.referral_relations FOR ALL USING (
  EXISTS (SELECT 1 FROM crm.ops_users WHERE user_id = auth.uid())
);

-- 首次运营账号需在 Supabase Dashboard 用 SQL + service_role 插入，或通过 Auth 邀请后执行：
-- INSERT INTO crm.ops_users (user_id, email, name, role) SELECT id, email, raw_user_meta_data->>'name', 'admin' FROM auth.users WHERE email = 'ops@example.com';

-- ------------------------------
-- 10. 主应用用：按空间查当前生效权益（SECURITY DEFINER，anon 可调用）
-- 生效订单：同一 space 下按 created_at 最新的一条 active 且未过期订单
-- 返回含 quota_period，主应用据此用 data_limits 的 *_per_week 或 *_per_month 做周期用量校验
-- ------------------------------
CREATE OR REPLACE FUNCTION crm.get_space_entitlements(p_space_id uuid)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = crm
AS $$
  SELECT jsonb_build_object(
    'feature_modules', COALESCE(s.feature_modules, '{}'),
    'data_limits',     COALESCE(s.data_limits, '{}'),
    'quota_period',    COALESCE(s.quota_period, 'month'),
    'sku_code',        s.code,
    'sku_name',        s.name,
    'price_monthly',   s.price_monthly,
    'currency',        s.currency,
    'expires_at',      o.expires_at
  )
  FROM crm.space_orders o
  JOIN crm.sku_edition s ON s.id = o.sku_id
  WHERE o.space_id = p_space_id
    AND o.status = 'active'
    AND (o.expires_at IS NULL OR o.expires_at > now())
  ORDER BY o.created_at DESC
  LIMIT 1;
$$;

COMMENT ON FUNCTION crm.get_space_entitlements(uuid) IS '主应用按空间查当前生效权益（按 created_at 最新订单），含模块、用量、价格与到期时间';
