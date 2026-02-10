-- ============================================================
-- 角色与菜单权限：admin 在「角色与权限」页配置各角色可见的菜单项
-- 菜单 key 与前端约定：overview_panorama | overview_my | customers_all | customers_my | orders_all | orders_my | sku_edition | sku_addon | team_members | roles_permissions
-- 在 Supabase SQL Editor 中执行
-- ============================================================

-- 表：角色 -> 可访问的菜单 key（多条记录表示该角色拥有多个菜单）
CREATE TABLE IF NOT EXISTS crm.role_menu_permissions (
  role text NOT NULL,
  menu_key text NOT NULL,
  PRIMARY KEY (role, menu_key)
);

COMMENT ON TABLE crm.role_menu_permissions IS '角色与菜单权限：仅在此表中的 (role, menu_key) 可访问对应菜单';

-- 默认权限：admin 全部；ops/sales/support 为「我的」+ 版本/增购只读
INSERT INTO crm.role_menu_permissions (role, menu_key)
VALUES
  ('admin', 'overview_panorama'),
  ('admin', 'overview_my'),
  ('admin', 'customers_all'),
  ('admin', 'customers_my'),
  ('admin', 'orders_all'),
  ('admin', 'orders_my'),
  ('admin', 'sku_edition'),
  ('admin', 'sku_addon'),
  ('admin', 'team_members'),
  ('admin', 'roles_permissions'),
  ('ops', 'overview_my'),
  ('ops', 'customers_my'),
  ('ops', 'orders_my'),
  ('ops', 'sku_edition'),
  ('ops', 'sku_addon'),
  ('ops', 'team_members'),
  ('sales', 'overview_my'),
  ('sales', 'customers_my'),
  ('sales', 'orders_my'),
  ('sales', 'sku_edition'),
  ('sales', 'sku_addon'),
  ('sales', 'team_members'),
  ('support', 'overview_my'),
  ('support', 'customers_my'),
  ('support', 'orders_my'),
  ('support', 'sku_edition'),
  ('support', 'sku_addon'),
  ('support', 'team_members')
ON CONFLICT (role, menu_key) DO NOTHING;

-- RLS
ALTER TABLE crm.role_menu_permissions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS role_menu_permissions_select_own_or_admin ON crm.role_menu_permissions;
DROP POLICY IF EXISTS role_menu_permissions_admin_all ON crm.role_menu_permissions;

-- 可读：当前用户角色对应的权限（用于前端显隐菜单）或 admin 可读全部
CREATE POLICY role_menu_permissions_select_own_or_admin ON crm.role_menu_permissions
  FOR SELECT TO authenticated
  USING (
    role = crm.current_ops_user_role()
    OR crm.current_ops_user_role() = 'admin'
  );

-- 仅 admin 可写
CREATE POLICY role_menu_permissions_admin_all ON crm.role_menu_permissions
  FOR ALL TO authenticated
  USING (crm.current_ops_user_role() = 'admin')
  WITH CHECK (crm.current_ops_user_role() = 'admin');

-- 暴露给前端
GRANT SELECT ON crm.role_menu_permissions TO authenticated;
GRANT INSERT, UPDATE, DELETE ON crm.role_menu_permissions TO authenticated;
