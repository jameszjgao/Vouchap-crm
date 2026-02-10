-- ============================================================
-- crm.ops_users 仅用 RLS：只保留“只看自己一行”的 SELECT，避免递归/卡住
-- 在 Supabase SQL Editor 中执行
-- ============================================================

-- 1. 删除所有会“查同一表”或调用函数的 policy（避免递归/超时）
DROP POLICY IF EXISTS ops_users_select_ops ON crm.ops_users;
DROP POLICY IF EXISTS ops_users_all_admin ON crm.ops_users;
DROP POLICY IF EXISTS ops_users_admin_all ON crm.ops_users;

-- 2. 只保留一条 SELECT 策略：当前用户只能看自己的那一行（不查同一表、不调函数）
--    若已有 ops_users_select_own 可跳过；若之前删过则需重建
DROP POLICY IF EXISTS ops_users_select_own ON crm.ops_users;
CREATE POLICY ops_users_select_own ON crm.ops_users
  FOR SELECT
  USING (user_id = auth.uid());

-- 3. 不设 INSERT/UPDATE/DELETE 的 RLS 策略 → 仅表所有者（如 service_role）可写
--    新增/修改运营人员请在 Dashboard 用 SQL 执行（或后续用 Edge Function + service_role）

COMMENT ON POLICY ops_users_select_own ON crm.ops_users IS '仅允许查看自己的运营账号行，登录鉴权用';
