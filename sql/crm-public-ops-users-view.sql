-- ============================================================
-- 供 CRM 登录鉴权用：在 public 下建视图 + 给 authenticated 查 crm.ops_users 的权限
-- 在 Supabase SQL Editor 中执行
-- ============================================================

-- 允许已登录角色访问 crm schema 下的 ops_users（RLS 仍会限制只能看到自己的行）
GRANT USAGE ON SCHEMA crm TO authenticated;
GRANT SELECT ON crm.ops_users TO authenticated;

CREATE OR REPLACE VIEW public.ops_users_view
WITH (security_invoker = true)
AS
SELECT id, user_id, email, name, role, created_at, updated_at
FROM crm.ops_users;

GRANT SELECT ON public.ops_users_view TO authenticated;

COMMENT ON VIEW public.ops_users_view IS 'CRM 运营人员只读视图，供前端登录鉴权用';
