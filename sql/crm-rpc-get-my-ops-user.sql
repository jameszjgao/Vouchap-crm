-- ============================================================
-- RPC：当前登录用户是否为运营（SECURITY DEFINER 直接读 crm.ops_users，不走 RLS，避免卡住）
-- 在 Supabase SQL Editor 中执行
-- ============================================================

-- 放在 public 下便于前端 rpc() 调用
CREATE OR REPLACE FUNCTION public.get_my_ops_user()
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = crm, public
STABLE
AS $$
  SELECT to_jsonb(o)
  FROM crm.ops_users o
  WHERE o.user_id = auth.uid()
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.get_my_ops_user() TO authenticated;

COMMENT ON FUNCTION public.get_my_ops_user() IS 'CRM 登录鉴权：返回当前用户的运营身份，SECURITY DEFINER 避免 RLS 卡住';
