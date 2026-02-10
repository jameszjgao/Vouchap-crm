-- ============================================================
-- 允许 CRM 运营人员读取 public.spaces（用于客户列表、订单/分配中的客户名称）
-- 运营人员登录后以 auth.uid() 查 crm.ops_users，主应用 public.spaces 的 RLS 通常只允许「空间成员」读，
-- 导致运营看不到任何空间。本脚本为 public.spaces 增加一条：在 crm.ops_users 中的用户可 SELECT。
-- 在 Supabase SQL Editor 中执行（需有 public 与 crm 的权限）
-- ============================================================

-- 确保 public.spaces 已启用 RLS（若未启用，取消下面一行注释）
-- ALTER TABLE public.spaces ENABLE ROW LEVEL SECURITY;

-- 策略：当前用户在 crm.ops_users 中则可读取所有 spaces（供 CRM 使用）
DROP POLICY IF EXISTS crm_ops_can_read_spaces ON public.spaces;
CREATE POLICY crm_ops_can_read_spaces ON public.spaces
  FOR SELECT
  TO authenticated
  USING (crm.current_ops_user_role() IS NOT NULL);

COMMENT ON POLICY crm_ops_can_read_spaces ON public.spaces IS 'CRM：运营人员（crm.ops_users）可读全部空间，用于线索/订单/分配展示';
