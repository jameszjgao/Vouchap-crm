-- ============================================================
-- 删除 public.ops_users_view（已无引用，CRM 均直接查 crm.ops_users）
-- 在 Supabase SQL Editor 中执行一次即可
-- ============================================================

DROP VIEW IF EXISTS public.ops_users_view;
