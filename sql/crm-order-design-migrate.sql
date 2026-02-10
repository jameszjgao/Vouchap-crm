-- ============================================================
-- 订单/SKU 设计迁移：价格字段、用量增购表、get_space_entitlements 返回价格
-- 若已按 crm-schema.sql 新建库可跳过；否则在 Supabase SQL Editor 执行
-- ============================================================

-- 1. crm.sku：增加 price_monthly、currency（若不存在）
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'crm' AND table_name = 'sku' AND column_name = 'price_monthly'
  ) THEN
    ALTER TABLE crm.sku ADD COLUMN price_monthly numeric(10, 2);
    COMMENT ON COLUMN crm.sku.price_monthly IS '月价，NULL=免费';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'crm' AND table_name = 'sku' AND column_name = 'currency'
  ) THEN
    ALTER TABLE crm.sku ADD COLUMN currency text NOT NULL DEFAULT 'USD';
    COMMENT ON COLUMN crm.sku.currency IS '货币代码';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'crm' AND table_name = 'sku' AND column_name = 'quota_period'
  ) THEN
    ALTER TABLE crm.sku ADD COLUMN quota_period text NOT NULL DEFAULT 'month';
    COMMENT ON COLUMN crm.sku.quota_period IS '用量统计周期：week | month';
  END IF;
END $$;

-- 2. crm.billing_addon：表不存在则创建
CREATE TABLE IF NOT EXISTS crm.billing_addon (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text,
  description text,
  units int NOT NULL,
  price numeric(10, 2) NOT NULL,
  currency text NOT NULL DEFAULT 'USD',
  is_active boolean NOT NULL DEFAULT true,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_billing_addon_code ON crm.billing_addon(code);
CREATE INDEX IF NOT EXISTS idx_billing_addon_active ON crm.billing_addon(is_active) WHERE is_active = true;

COMMENT ON TABLE crm.billing_addon IS '用量增购：每 N 条数据的价格';

ALTER TABLE crm.billing_addon ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS billing_addon_ops ON crm.billing_addon;
DROP POLICY IF EXISTS billing_addon_select_authenticated ON crm.billing_addon;

CREATE POLICY billing_addon_ops ON crm.billing_addon FOR ALL USING (
  EXISTS (SELECT 1 FROM crm.ops_users WHERE user_id = auth.uid())
);

CREATE POLICY billing_addon_select_authenticated ON crm.billing_addon
  FOR SELECT USING (is_active = true);

-- 3. space_orders 索引（便于取生效订单）
CREATE INDEX IF NOT EXISTS idx_space_orders_space_created ON crm.space_orders(space_id, created_at DESC);

-- 4. get_space_entitlements：按 created_at 最新订单，返回 sku_name、price_monthly、currency
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
  JOIN crm.sku s ON s.id = o.sku_id
  WHERE o.space_id = p_space_id
    AND o.status = 'active'
    AND (o.expires_at IS NULL OR o.expires_at > now())
  ORDER BY o.created_at DESC
  LIMIT 1;
$$;

COMMENT ON FUNCTION crm.get_space_entitlements(uuid) IS '主应用按空间查当前生效权益（按 created_at 最新订单），含模块、用量、价格与到期时间';
