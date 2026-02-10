-- ============================================================
-- CRM 登录一条龙：schema / 表 / RLS / 权限 / 从 auth 同步运营账号
-- 前提：先在 Dashboard > Authentication > Users 里添加用户 jamesgao@aim.link
-- 执行：整段复制到 Supabase SQL Editor 执行
-- ============================================================

-- 1. Schema 与 ops_users 表
CREATE SCHEMA IF NOT EXISTS crm;

CREATE TABLE IF NOT EXISTS crm.ops_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  name text,
  email text NOT NULL,
  role text NOT NULL DEFAULT 'ops',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ops_users_user_id ON crm.ops_users(user_id);
CREATE INDEX IF NOT EXISTS idx_ops_users_role ON crm.ops_users(role);

-- 2. RLS 开启
ALTER TABLE crm.ops_users ENABLE ROW LEVEL SECURITY;

-- 3. 删除旧策略（避免重复执行报错）
DROP POLICY IF EXISTS ops_users_select_ops ON crm.ops_users;
DROP POLICY IF EXISTS ops_users_all_admin ON crm.ops_users;
DROP POLICY IF EXISTS ops_users_select_own ON crm.ops_users;
DROP POLICY IF EXISTS ops_users_select_admin ON crm.ops_users;
DROP POLICY IF EXISTS ops_users_insert_admin ON crm.ops_users;
DROP POLICY IF EXISTS ops_users_update_admin ON crm.ops_users;
DROP POLICY IF EXISTS ops_users_delete_admin ON crm.ops_users;

-- 4. RLS 策略：自己能看自己；admin 能看全部、能写
CREATE POLICY ops_users_select_own ON crm.ops_users
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY ops_users_select_admin ON crm.ops_users
  FOR SELECT USING ((auth.jwt()->'app_metadata'->>'crm_role') = 'admin');

CREATE POLICY ops_users_insert_admin ON crm.ops_users
  FOR INSERT WITH CHECK ((auth.jwt()->'app_metadata'->>'crm_role') = 'admin');

CREATE POLICY ops_users_update_admin ON crm.ops_users
  FOR UPDATE USING ((auth.jwt()->'app_metadata'->>'crm_role') = 'admin');

CREATE POLICY ops_users_delete_admin ON crm.ops_users
  FOR DELETE USING ((auth.jwt()->'app_metadata'->>'crm_role') = 'admin');

-- 5. API 权限（anon/authenticated 能查 crm.ops_users）
GRANT USAGE ON SCHEMA crm TO anon, authenticated, service_role;
GRANT SELECT ON crm.ops_users TO anon, authenticated, service_role;

-- 6. 从 auth.users 同步运营账号（user_id 一定等于 auth 的 id）
-- 邮箱改成你要加的人；先确保该用户已在 Authentication > Users 里存在
INSERT INTO crm.ops_users (user_id, email, name, role)
SELECT
  id,
  email,
  COALESCE(raw_user_meta_data->>'name', split_part(email, '@', 1)),
  'admin'
FROM auth.users
WHERE email = 'jamesgao@aim.link'
ON CONFLICT (user_id)
DO UPDATE SET
  email = EXCLUDED.email,
  name  = COALESCE(EXCLUDED.name, crm.ops_users.name),
  role  = EXCLUDED.role,
  updated_at = now();

-- 7. 校验（应有一条，且 user_id 与 auth 一致）
SELECT ou.id, ou.user_id, ou.email, ou.role, au.id AS auth_id, (ou.user_id = au.id) AS 一致
FROM crm.ops_users ou
JOIN auth.users au ON au.email = ou.email
WHERE ou.email = 'jamesgao@aim.link';
