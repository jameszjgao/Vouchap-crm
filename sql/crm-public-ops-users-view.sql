-- ============================================================
-- 供 CRM 登录鉴权用：给 authenticated 查 crm.ops_users 的权限（RLS 限制仅可见自己的行）
-- 在 Supabase SQL Editor 中执行
-- ============================================================
-- 说明：曾存在 public.ops_users_view，因代码均直接查 crm.ops_users 已无引用，已废弃并删除。
-- 若库里仍有该视图，可执行 sql/crm-drop-public-ops-users-view.sql 清理。

GRANT USAGE ON SCHEMA crm TO authenticated;
GRANT SELECT ON crm.ops_users TO authenticated;
