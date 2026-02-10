-- ============================================================
-- 暴露 crm schema 给 PostgREST，使 supabase.schema('crm') 可查询
-- 在 Supabase SQL Editor 中执行（需 project owner 权限）
-- 若 ALTER ROLE 失败，请在 Dashboard > Project Settings > API > Exposed schemas 中手动添加 crm
-- ============================================================

GRANT USAGE ON SCHEMA crm TO anon, authenticated, service_role;
GRANT SELECT ON crm.ops_users TO anon, authenticated, service_role;
GRANT SELECT ON crm.sku_edition TO anon, authenticated, service_role;
GRANT SELECT ON crm.sku_addon TO anon, authenticated, service_role;
-- 订单与分配：CRM 前端需读/写
GRANT SELECT, INSERT ON crm.space_orders TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON crm.ops_assignments TO authenticated;

-- 让 PostgREST 识别 crm schema（部分 Supabase 版本支持）
-- ALTER ROLE authenticator SET pgrst.db_schemas = 'public, crm';
-- 若上述失败，请在 Dashboard > API Settings > Exposed schemas 添加 crm
