-- ============================================================
-- 修复 crm.ops_users 的 RLS 递归：用 SECURITY DEFINER 函数替代“查同一表”的 policy
-- 在 Supabase SQL Editor 中执行
-- ============================================================

-- 辅助函数：返回当前用户在 crm.ops_users 中的 role（SECURITY DEFINER 不触发 RLS，避免递归）
CREATE OR REPLACE FUNCTION crm.current_ops_user_role()
RETURNS text
LANGUAGE sql
SECURITY DEFINER
SET search_path = crm
STABLE
AS $$
  SELECT role FROM crm.ops_users WHERE user_id = auth.uid() LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION crm.current_ops_user_role() TO authenticated;

-- 删除会触发递归的 policy（它们内部 SELECT 了 crm.ops_users）
DROP POLICY IF EXISTS ops_users_select_ops ON crm.ops_users;
DROP POLICY IF EXISTS ops_users_all_admin ON crm.ops_users;

-- 保留已有策略 ops_users_select_own（普通用户只能看自己的行），不再改动

-- 用函数判断 admin，不再查同一表，避免递归
CREATE POLICY ops_users_admin_all ON crm.ops_users
  FOR ALL
  USING (crm.current_ops_user_role() = 'admin');

COMMENT ON FUNCTION crm.current_ops_user_role() IS 'RLS 用：返回当前运营用户角色，避免 policy 内查 ops_users 导致递归';
