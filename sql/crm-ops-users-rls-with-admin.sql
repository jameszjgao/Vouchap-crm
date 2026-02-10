-- ============================================================
-- 解决副作用：admin 可查看/管理全部运营人员，且 RLS 不递归、不卡住
-- 用独立表 crm.ops_admin_ids 存 admin 名单，policy 只查该表、不查 ops_users
-- 在 Supabase SQL Editor 中执行
-- ============================================================

-- 1. 独立表：仅存“谁是 admin”（policy 只查此表，不查 ops_users，避免递归）
--    不建 FK 到 auth.users，便于未来分库；由触发器与业务保证一致性
CREATE TABLE IF NOT EXISTS crm.ops_admin_ids (
  user_id uuid PRIMARY KEY
);

COMMENT ON TABLE crm.ops_admin_ids IS '运营 admin 名单，供 RLS 判断“是否 admin”用，不直接查 ops_users 避免递归';

-- 2. 同步现有 admin 到 ops_admin_ids
INSERT INTO crm.ops_admin_ids (user_id)
SELECT user_id FROM crm.ops_users WHERE role = 'admin'
ON CONFLICT (user_id) DO NOTHING;

-- 3. RLS：每人只能看自己是否在名单里（用于 policy 里的 EXISTS 判断）
ALTER TABLE crm.ops_admin_ids ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ops_admin_ids_select_own ON crm.ops_admin_ids;
CREATE POLICY ops_admin_ids_select_own ON crm.ops_admin_ids
  FOR SELECT
  USING (user_id = auth.uid());

GRANT USAGE ON SCHEMA crm TO authenticated;
GRANT SELECT ON crm.ops_admin_ids TO authenticated;

-- 4. 触发器：ops_users 增删改时同步 ops_admin_ids（仅 role='admin' 的进表）
CREATE OR REPLACE FUNCTION crm.sync_ops_admin_ids()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = crm
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    DELETE FROM crm.ops_admin_ids WHERE user_id = OLD.user_id;
    RETURN OLD;
  END IF;
  IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN
    IF NEW.role = 'admin' THEN
      INSERT INTO crm.ops_admin_ids (user_id) VALUES (NEW.user_id)
      ON CONFLICT (user_id) DO NOTHING;
    ELSE
      DELETE FROM crm.ops_admin_ids WHERE user_id = NEW.user_id;
    END IF;
    RETURN NEW;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS sync_ops_admin_ids_trigger ON crm.ops_users;
CREATE TRIGGER sync_ops_admin_ids_trigger
  AFTER INSERT OR UPDATE OF role OR DELETE ON crm.ops_users
  FOR EACH ROW
  EXECUTE FUNCTION crm.sync_ops_admin_ids();

-- 5. crm.ops_users 的 RLS：只看自己 或 自己是 admin 则看全部；admin 可写
DROP POLICY IF EXISTS ops_users_select_own ON crm.ops_users;
DROP POLICY IF EXISTS ops_users_admin_all ON crm.ops_users;
DROP POLICY IF EXISTS ops_users_admin_select ON crm.ops_users;
DROP POLICY IF EXISTS ops_users_admin_write ON crm.ops_users;

CREATE POLICY ops_users_select_own ON crm.ops_users
  FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY ops_users_admin_select ON crm.ops_users
  FOR SELECT
  USING (EXISTS (SELECT 1 FROM crm.ops_admin_ids WHERE user_id = auth.uid()));

CREATE POLICY ops_users_admin_insert ON crm.ops_users
  FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM crm.ops_admin_ids WHERE user_id = auth.uid()));

CREATE POLICY ops_users_admin_update ON crm.ops_users
  FOR UPDATE
  USING (EXISTS (SELECT 1 FROM crm.ops_admin_ids WHERE user_id = auth.uid()));

CREATE POLICY ops_users_admin_delete ON crm.ops_users
  FOR DELETE
  USING (EXISTS (SELECT 1 FROM crm.ops_admin_ids WHERE user_id = auth.uid()));

COMMENT ON POLICY ops_users_select_own ON crm.ops_users IS '每人可看自己的运营账号行';
COMMENT ON POLICY ops_users_admin_select ON crm.ops_users IS 'admin 可看全部运营人员（通过 ops_admin_ids 判断，不查 ops_users 避免递归）';
