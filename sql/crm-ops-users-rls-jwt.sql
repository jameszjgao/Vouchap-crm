-- ============================================================
-- crm.ops_users RLS 用 JWT app_metadata 判断角色（不查本表，无递归）
-- 约定：Auth 的 app_metadata.crm_role 与 crm.ops_users.role 同步（由 Edge Function 同步）
-- 在 Supabase SQL Editor 中执行
-- ============================================================

-- 1. 删除旧 policy（含之前用函数/另表的，以及本脚本创建的，便于重复执行）
DROP POLICY IF EXISTS ops_users_select_ops ON crm.ops_users;
DROP POLICY IF EXISTS ops_users_all_admin ON crm.ops_users;
DROP POLICY IF EXISTS ops_users_admin_all ON crm.ops_users;
DROP POLICY IF EXISTS ops_users_admin_select ON crm.ops_users;
DROP POLICY IF EXISTS ops_users_select_admin ON crm.ops_users;
DROP POLICY IF EXISTS ops_users_admin_insert ON crm.ops_users;
DROP POLICY IF EXISTS ops_users_insert_admin ON crm.ops_users;
DROP POLICY IF EXISTS ops_users_admin_update ON crm.ops_users;
DROP POLICY IF EXISTS ops_users_update_admin ON crm.ops_users;
DROP POLICY IF EXISTS ops_users_admin_delete ON crm.ops_users;
DROP POLICY IF EXISTS ops_users_delete_admin ON crm.ops_users;
DROP POLICY IF EXISTS ops_users_select_own ON crm.ops_users;

-- 2. SELECT：看自己的行 或 JWT 里是 admin 则看全部（不查 crm.ops_users，无递归）
CREATE POLICY ops_users_select_own ON crm.ops_users
  FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY ops_users_select_admin ON crm.ops_users
  FOR SELECT
  USING ((auth.jwt()->'app_metadata'->>'crm_role') = 'admin');

-- 3. INSERT/UPDATE/DELETE：仅 JWT 里是 admin 时可写
CREATE POLICY ops_users_insert_admin ON crm.ops_users
  FOR INSERT
  WITH CHECK ((auth.jwt()->'app_metadata'->>'crm_role') = 'admin');

CREATE POLICY ops_users_update_admin ON crm.ops_users
  FOR UPDATE
  USING ((auth.jwt()->'app_metadata'->>'crm_role') = 'admin');

CREATE POLICY ops_users_delete_admin ON crm.ops_users
  FOR DELETE
  USING ((auth.jwt()->'app_metadata'->>'crm_role') = 'admin');

COMMENT ON POLICY ops_users_select_own ON crm.ops_users IS '每人可看自己的运营账号行（登录鉴权）';
COMMENT ON POLICY ops_users_select_admin ON crm.ops_users IS 'JWT 中 crm_role=admin 可看全部（不查本表，无递归）';
