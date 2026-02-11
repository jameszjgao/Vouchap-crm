-- ============================================================
-- 暴露 crm schema 给 PostgREST，使 supabase.schema('crm') 可查询
-- 在 Supabase SQL Editor 中执行（需 project owner 权限）
--
-- 执行顺序：先执行 crm-schema.sql、crm-role-menu-permissions.sql 等创建好表，
-- 再执行本脚本。若报 relation "crm.xxx" does not exist，请先执行对应建表脚本。
-- ============================================================

GRANT USAGE ON SCHEMA crm TO anon, authenticated, service_role;
GRANT SELECT ON crm.ops_users TO anon, authenticated, service_role;
GRANT SELECT ON crm.sku_edition TO anon, authenticated, service_role;
GRANT SELECT ON crm.sku_addon TO anon, authenticated, service_role;
-- 订单与分配：CRM 前端需读/写
GRANT SELECT, INSERT ON crm.space_orders TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON crm.ops_assignments TO authenticated;

-- 角色与权限：admin 可读/写（表需先由 crm-role-menu-permissions.sql 创建）
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'crm' AND table_name = 'role_menu_permissions') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON crm.role_menu_permissions TO authenticated;
  END IF;
END $$;

-- ============================================================
-- 重要：必须让 PostgREST 暴露 crm schema，否则前端会报：
--   Could not find the table 'crm.role_menu_permissions' in the schema cache
-- 操作步骤（二选一）：
--   1. 打开 Supabase Dashboard → Project Settings → API
--      找到 "Exposed schemas" → 点击编辑 → 添加 crm → 保存
--   2. 若支持 SQL 配置：ALTER ROLE authenticator SET pgrst.db_schemas = 'public, crm';
-- ============================================================
