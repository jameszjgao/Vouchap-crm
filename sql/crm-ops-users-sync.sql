-- ============================================================
-- 1. 校验：当前 crm.ops_users 与 auth.users 是否一致
-- 2. 修复：用 auth.users 的数据覆盖/插入，保证 user_id 一定等于 auth.users.id
--
-- 为何直接插入容易出问题：
--   user_id 必须 = auth.users.id（UUID），手填容易抄错或填成别的。
--   登录时 auth.uid() 是 auth 里的 id，若 crm.ops_users.user_id 不一致就查不到。
-- 推荐：始终用本脚本的 INSERT...SELECT 从 auth.users 同步。
-- ============================================================

-- 一、先看现状：auth 与 crm 是否一一对应
SELECT
  au.id AS auth_id,
  au.email,
  ou.user_id AS crm_user_id,
  CASE WHEN ou.user_id = au.id THEN '一致' ELSE '不一致→会登录失败' END AS 校验
FROM auth.users au
LEFT JOIN crm.ops_users ou ON ou.email = au.email
ORDER BY au.email;

-- 二、修复：已有行 user_id 填错时，用 auth.users.id 覆盖（按邮箱对齐）
UPDATE crm.ops_users ou
SET user_id = au.id, updated_at = now()
FROM auth.users au
WHERE au.email = ou.email AND ou.email = 'jamesgao@aim.link';

-- 三、以后新增运营：从 auth.users 插入，保证 user_id = auth.users.id
INSERT INTO crm.ops_users (user_id, email, name, role)
SELECT
  id,
  email,
  COALESCE(raw_user_meta_data->>'name', split_part(email, '@', 1)),
  'admin'
FROM auth.users
WHERE email = 'jamesgao@aim.link'   -- 改成要加的人的邮箱
ON CONFLICT (user_id)
DO UPDATE SET
  email = EXCLUDED.email,
  name  = COALESCE(EXCLUDED.name, crm.ops_users.name),
  role  = EXCLUDED.role,
  updated_at = now();

-- 四、再次校验（user_id 应等于 auth.users.id）
SELECT ou.*, au.id AS auth_id, (ou.user_id = au.id) AS 一致
FROM crm.ops_users ou
JOIN auth.users au ON au.email = ou.email
WHERE ou.email = 'jamesgao@aim.link';
