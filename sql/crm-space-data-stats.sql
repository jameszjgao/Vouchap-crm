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

-- ============================================================
-- 批量按空间统计四类数据总量（收据+发票+入库+出库），供客户列表「数据量」列
-- ============================================================

DROP FUNCTION IF EXISTS public.get_spaces_data_totals(uuid[]);

CREATE OR REPLACE FUNCTION public.get_spaces_data_totals(p_space_ids uuid[])
RETURNS TABLE(space_id uuid, total bigint)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  sid uuid;
  v_receipts bigint;
  v_invoices bigint;
  v_inbound  bigint;
  v_outbound bigint;
BEGIN
  IF p_space_ids IS NULL OR array_length(p_space_ids, 1) IS NULL THEN
    RETURN;
  END IF;

  FOREACH sid IN ARRAY p_space_ids
  LOOP
    v_receipts := 0;
    v_invoices := 0;
    v_inbound  := 0;
    v_outbound := 0;

    BEGIN
      SELECT COUNT(*) INTO v_receipts FROM receipts WHERE space_id = sid;
    EXCEPTION WHEN undefined_table THEN
      NULL;
    END;
    BEGIN
      SELECT COUNT(*) INTO v_invoices FROM invoices WHERE space_id = sid;
    EXCEPTION WHEN undefined_table THEN
      NULL;
    END;
    BEGIN
      SELECT COUNT(*) INTO v_inbound FROM inbound WHERE space_id = sid;
    EXCEPTION WHEN undefined_table THEN
      NULL;
    END;
    BEGIN
      SELECT COUNT(*) INTO v_outbound FROM outbound WHERE space_id = sid;
    EXCEPTION WHEN undefined_table THEN
      NULL;
    END;

    space_id := sid;
    total := COALESCE(v_receipts, 0) + COALESCE(v_invoices, 0) + COALESCE(v_inbound, 0) + COALESCE(v_outbound, 0);
    RETURN NEXT;
  END LOOP;
END;
$$;

COMMENT ON FUNCTION public.get_spaces_data_totals(uuid[]) IS '按空间批量统计：收据+发票+入库+出库 条数之和，供 CRM 客户列表数据量列';

GRANT EXECUTE ON FUNCTION public.get_spaces_data_totals(uuid[]) TO authenticated;

