-- ============================================================
-- CRM 登录配置全面诊断
-- 在 Supabase SQL Editor 中执行，逐项检查是否有问题
-- ============================================================

-- 1. Schema 与表是否存在
SELECT '1. Schema 与表' AS section;
SELECT
  EXISTS(SELECT 1 FROM information_schema.schemata WHERE schema_name = 'crm') AS crm_schema_exists,
  EXISTS(SELECT 1 FROM information_schema.tables WHERE table_schema = 'crm' AND table_name = 'ops_users') AS ops_users_exists;

-- 2. crm.ops_users 表结构
SELECT '2. ops_users 表结构' AS section;
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'crm' AND table_name = 'ops_users'
ORDER BY ordinal_position;

-- 3. RLS 是否启用
SELECT '3. RLS 状态' AS section;
SELECT schemaname, tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'crm' AND tablename = 'ops_users';

-- 4. RLS Policies 列表
SELECT '4. RLS Policies' AS section;
SELECT policyname, cmd, qual::text AS using_expr
FROM pg_policies
WHERE schemaname = 'crm' AND tablename = 'ops_users';

-- 5. Schema 权限（USAGE on crm）
SELECT '5. Schema crm 的 USAGE 权限' AS section;
SELECT grantee, privilege_type
FROM information_schema.usage_privileges
WHERE object_schema = 'crm' AND object_type = 'SCHEMA'
ORDER BY grantee, privilege_type;

-- 6. Table 权限（crm.ops_users）
SELECT '6. crm.ops_users 的 SELECT 权限' AS section;
SELECT grantee, privilege_type
FROM information_schema.table_privileges
WHERE table_schema = 'crm' AND table_name = 'ops_users'
ORDER BY grantee, privilege_type;

-- 7. PostgREST 暴露的 schema（authenticator 的 rolconfig）
SELECT '7. authenticator/anon 的 rolconfig（pgrst.db_schemas）' AS section;
SELECT rolname, rolconfig
FROM pg_roles
WHERE rolname IN ('authenticator', 'anon', 'authenticated')
  AND rolconfig IS NOT NULL;

-- 8. auth.users 与 crm.ops_users 对比
SELECT '8. auth.users 与 crm.ops_users 对比' AS section;
SELECT
  au.id AS auth_id,
  au.email,
  ou.id AS ops_id,
  ou.user_id AS ops_user_id,
  ou.role,
  CASE WHEN ou.user_id = au.id THEN 'OK' ELSE 'MISMATCH' END AS id_match
FROM auth.users au
LEFT JOIN crm.ops_users ou ON ou.user_id = au.id
ORDER BY au.email;

-- 9. 缺失的运营账号（在 auth 但不在 ops_users，会登录失败）
SELECT '9. 在 auth 但不在 ops_users 的用户（需补录）' AS section;
SELECT au.id, au.email
FROM auth.users au
LEFT JOIN crm.ops_users ou ON ou.user_id = au.id
WHERE ou.id IS NULL
ORDER BY au.email;

-- 10. 模拟权限检查
SELECT '10. 权限模拟（anon/authenticated 能否访问 crm.ops_users）' AS section;
SELECT
  has_schema_privilege('anon', 'crm', 'USAGE') AS anon_crm_usage,
  has_schema_privilege('authenticated', 'crm', 'USAGE') AS authenticated_crm_usage,
  has_table_privilege('anon', 'crm.ops_users', 'SELECT') AS anon_ops_select,
  has_table_privilege('authenticated', 'crm.ops_users', 'SELECT') AS authenticated_ops_select;
