-- ============================================================
-- 表重命名迁移：billing_addon → sku_addon，sku → sku_edition
-- 复制整段在 Supabase SQL Editor 中执行即可
-- ============================================================

-- 1. 重命名表
ALTER TABLE crm.billing_addon RENAME TO sku_addon;
ALTER TABLE crm.sku RENAME TO sku_edition;

-- 2. 更新函数 get_space_entitlements（引用 crm.sku_edition）
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

-- 3. RLS：表重命名后旧策略仍挂在 sku_edition / sku_addon 上，统一为 schema 中的策略名
DROP POLICY IF EXISTS billing_addon_ops ON crm.sku_addon;
DROP POLICY IF EXISTS billing_addon_select_authenticated ON crm.sku_addon;
CREATE POLICY sku_addon_ops ON crm.sku_addon FOR ALL USING (
  EXISTS (SELECT 1 FROM crm.ops_users WHERE user_id = auth.uid())
);
CREATE POLICY sku_addon_select_authenticated ON crm.sku_addon FOR SELECT USING (is_active = true);
