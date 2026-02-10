-- ============================================================
-- 修复 James 登录问题：
-- 1. 确保用户存在于 crm.ops_users 表中（这是登录必须的，不仅要在 auth.users）
-- 2. 简化 RLS 策略，确保 api 可以查询到该用户
-- ============================================================

-- I. 插入/同步用户到 crm.ops_users
INSERT INTO crm.ops_users (user_id, email, name, role)
SELECT 
    id, 
    email, 
    COALESCE(raw_user_meta_data->>'name', 'James'), 
    'admin'
FROM auth.users
WHERE email = 'jamesgao@aim.link'
ON CONFLICT (user_id) 
DO UPDATE SET 
    role = 'admin', 
    email = EXCLUDED.email; -- 确保是最新的

-- II. 修复 RLS (Row Level Security) ensuring entry is readable
-- 删除可能导致递归或错误的旧策略
DROP POLICY IF EXISTS ops_users_select_ops ON crm.ops_users;
DROP POLICY IF EXISTS ops_users_all_admin ON crm.ops_users;
DROP POLICY IF EXISTS ops_users_admin_all ON crm.ops_users;

-- 确保只有一条清晰的 SELECT 策略：允许用户查看自己的记录
DROP POLICY IF EXISTS ops_users_select_own ON crm.ops_users;
CREATE POLICY ops_users_select_own ON crm.ops_users
  FOR SELECT
  USING (user_id = auth.uid());

-- 确认
SELECT * FROM crm.ops_users WHERE email = 'jamesgao@aim.link';
