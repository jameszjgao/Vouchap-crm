-- ============================================================
-- 按空间统计数据量：receipts / invoices / inbound / outbound 条数
-- 用于 CRM 客户详情页展示该客户的数据规模
-- 在 Supabase SQL Editor 中执行
-- 依赖主应用已存在：public.receipts, public.invoices, public.inbound, public.outbound
--
-- 注意：Supabase 的 rpc() 默认在 public schema 下找函数，
-- 所以函数需要建在 public，而不是 crm。
-- ============================================================

DROP FUNCTION IF EXISTS public.get_space_data_stats(uuid);

CREATE OR REPLACE FUNCTION public.get_space_data_stats(p_space_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, crm
AS $$
DECLARE
  v_receipts bigint := 0;
  v_invoices bigint := 0;
  v_inbound  bigint := 0;
  v_outbound bigint := 0;
BEGIN
  BEGIN
    SELECT COUNT(*) INTO v_receipts FROM receipts WHERE space_id = p_space_id;
  EXCEPTION WHEN undefined_table THEN
    v_receipts := 0;
  END;

  BEGIN
    SELECT COUNT(*) INTO v_invoices FROM invoices WHERE space_id = p_space_id;
  EXCEPTION WHEN undefined_table THEN
    v_invoices := 0;
  END;

  BEGIN
    SELECT COUNT(*) INTO v_inbound FROM inbound WHERE space_id = p_space_id;
  EXCEPTION WHEN undefined_table THEN
    v_inbound := 0;
  END;

  BEGIN
    SELECT COUNT(*) INTO v_outbound FROM outbound WHERE space_id = p_space_id;
  EXCEPTION WHEN undefined_table THEN
    v_outbound := 0;
  END;

  RETURN jsonb_build_object(
    'receipts', v_receipts,
    'invoices', v_invoices,
    'inbound',  v_inbound,
    'outbound', v_outbound
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_space_data_stats(uuid) TO authenticated;

