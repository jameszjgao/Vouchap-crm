-- Adaven-CRM Hub: ops identity, cross-product assignments, follow-ups, audit.
-- Entitlement facts (SKU / orders) stay on each product database.

CREATE SCHEMA IF NOT EXISTS crm;

CREATE OR REPLACE FUNCTION crm.touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TABLE IF NOT EXISTS crm.products (
  id text PRIMARY KEY,
  name text NOT NULL,
  tenant_model text NOT NULL CHECK (tenant_model IN ('space', 'workspace')),
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO crm.products (id, name, tenant_model, sort_order)
VALUES
  ('vouchap', 'Vouchap', 'space', 10),
  ('portalflow', 'Portalflow', 'space', 20),
  ('wholestore', 'Wholestore', 'space', 30),
  ('aimlink', 'aim.link', 'workspace', 40)
ON CONFLICT (id) DO UPDATE
SET name = EXCLUDED.name,
    tenant_model = EXCLUDED.tenant_model,
    sort_order = EXCLUDED.sort_order;

CREATE TABLE IF NOT EXISTS crm.ops_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  name text,
  email text NOT NULL,
  role text NOT NULL DEFAULT 'ops',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_hub_ops_users_user_id ON crm.ops_users (user_id);
CREATE INDEX IF NOT EXISTS idx_hub_ops_users_role ON crm.ops_users (role);

DROP TRIGGER IF EXISTS trg_hub_ops_users_touch ON crm.ops_users;
CREATE TRIGGER trg_hub_ops_users_touch
  BEFORE UPDATE ON crm.ops_users
  FOR EACH ROW EXECUTE FUNCTION crm.touch_updated_at();

CREATE TABLE IF NOT EXISTS crm.ops_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id text NOT NULL REFERENCES crm.products (id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL,
  ops_user_id uuid NOT NULL REFERENCES crm.ops_users (id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'primary',
  assigned_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (product_id, tenant_id)
);

CREATE INDEX IF NOT EXISTS idx_hub_assignments_ops ON crm.ops_assignments (ops_user_id);
CREATE INDEX IF NOT EXISTS idx_hub_assignments_product ON crm.ops_assignments (product_id);

CREATE TABLE IF NOT EXISTS crm.tenant_follow_ups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id text NOT NULL REFERENCES crm.products (id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL,
  ops_user_id uuid REFERENCES crm.ops_users (id) ON DELETE SET NULL,
  content text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_hub_follow_ups_tenant ON crm.tenant_follow_ups (product_id, tenant_id, created_at DESC);

CREATE TABLE IF NOT EXISTS crm.ops_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ops_user_id uuid REFERENCES crm.ops_users (id) ON DELETE SET NULL,
  action text NOT NULL,
  resource_type text NOT NULL,
  resource_id text,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_hub_audit_created ON crm.ops_audit_log (created_at DESC);

CREATE TABLE IF NOT EXISTS crm.role_menu_permissions (
  role text NOT NULL,
  menu_key text NOT NULL,
  PRIMARY KEY (role, menu_key)
);

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

CREATE OR REPLACE FUNCTION crm.current_ops_user_role()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = crm
AS $$
  SELECT role FROM crm.ops_users WHERE user_id = auth.uid() LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION crm.current_ops_user_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = crm
AS $$
  SELECT id FROM crm.ops_users WHERE user_id = auth.uid() LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION crm.is_ops_user()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = crm
AS $$
  SELECT EXISTS (SELECT 1 FROM crm.ops_users WHERE user_id = auth.uid());
$$;

ALTER TABLE crm.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm.ops_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm.ops_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm.tenant_follow_ups ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm.ops_audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm.role_menu_permissions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS products_select_ops ON crm.products;
CREATE POLICY products_select_ops ON crm.products
  FOR SELECT TO authenticated
  USING (crm.is_ops_user());

DROP POLICY IF EXISTS ops_users_select ON crm.ops_users;
CREATE POLICY ops_users_select ON crm.ops_users
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR crm.current_ops_user_role() = 'admin' OR crm.is_ops_user());

DROP POLICY IF EXISTS ops_users_admin_write ON crm.ops_users;
CREATE POLICY ops_users_admin_write ON crm.ops_users
  FOR ALL TO authenticated
  USING (crm.current_ops_user_role() = 'admin')
  WITH CHECK (crm.current_ops_user_role() = 'admin');

DROP POLICY IF EXISTS assignments_select_ops ON crm.ops_assignments;
CREATE POLICY assignments_select_ops ON crm.ops_assignments
  FOR SELECT TO authenticated
  USING (crm.is_ops_user());

DROP POLICY IF EXISTS assignments_admin_write ON crm.ops_assignments;
CREATE POLICY assignments_admin_write ON crm.ops_assignments
  FOR ALL TO authenticated
  USING (crm.current_ops_user_role() = 'admin')
  WITH CHECK (crm.current_ops_user_role() = 'admin');

DROP POLICY IF EXISTS follow_ups_select_ops ON crm.tenant_follow_ups;
CREATE POLICY follow_ups_select_ops ON crm.tenant_follow_ups
  FOR SELECT TO authenticated
  USING (crm.is_ops_user());

DROP POLICY IF EXISTS follow_ups_insert_ops ON crm.tenant_follow_ups;
CREATE POLICY follow_ups_insert_ops ON crm.tenant_follow_ups
  FOR INSERT TO authenticated
  WITH CHECK (crm.is_ops_user() AND ops_user_id = crm.current_ops_user_id());

DROP POLICY IF EXISTS audit_select_ops ON crm.ops_audit_log;
CREATE POLICY audit_select_ops ON crm.ops_audit_log
  FOR SELECT TO authenticated
  USING (crm.is_ops_user());

DROP POLICY IF EXISTS audit_insert_ops ON crm.ops_audit_log;
CREATE POLICY audit_insert_ops ON crm.ops_audit_log
  FOR INSERT TO authenticated
  WITH CHECK (crm.is_ops_user());

DROP POLICY IF EXISTS role_menu_permissions_select_own_or_admin ON crm.role_menu_permissions;
CREATE POLICY role_menu_permissions_select_own_or_admin ON crm.role_menu_permissions
  FOR SELECT TO authenticated
  USING (
    role = crm.current_ops_user_role()
    OR crm.current_ops_user_role() = 'admin'
  );

DROP POLICY IF EXISTS role_menu_permissions_admin_all ON crm.role_menu_permissions;
CREATE POLICY role_menu_permissions_admin_all ON crm.role_menu_permissions
  FOR ALL TO authenticated
  USING (crm.current_ops_user_role() = 'admin')
  WITH CHECK (crm.current_ops_user_role() = 'admin');

GRANT USAGE ON SCHEMA crm TO authenticated, service_role, anon;
GRANT SELECT ON crm.products TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON crm.ops_users TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON crm.ops_assignments TO authenticated;
GRANT SELECT, INSERT ON crm.tenant_follow_ups TO authenticated;
GRANT SELECT, INSERT ON crm.ops_audit_log TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON crm.role_menu_permissions TO authenticated;

GRANT ALL ON ALL TABLES IN SCHEMA crm TO service_role;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA crm TO authenticated, service_role;

ALTER ROLE authenticator SET pgrst.db_schemas = 'public, crm';
NOTIFY pgrst, 'reload config';

COMMENT ON SCHEMA crm IS 'Adaven-CRM Hub: ops identity and cross-product assignments. Product SKU/orders live on each product DB.';
COMMENT ON TABLE crm.ops_assignments IS 'One primary owner per (product_id, tenant_id). tenant_id is space_id or workspace_id on the product DB.';
COMMENT ON TABLE crm.tenant_follow_ups IS 'Ops follow-ups keyed by product + tenant; not stored on product DBs.';
