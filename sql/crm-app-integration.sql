-- ============================================================
-- CRM 与主应用集成：注册时邀请码、空间创建时试用订单与运营分配
-- 在 Supabase SQL Editor 中执行（与主应用同库）
-- ============================================================

-- ------------------------------
-- 1. 注册时生成邀请码：供 App/Web 在用户注册成功后调用
-- 一用户一码，已存在则跳过（ON CONFLICT DO NOTHING）
-- ------------------------------
CREATE OR REPLACE FUNCTION public.ensure_referral_code(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = crm, public
AS $$
DECLARE
  new_code text;
  done boolean := false;
  attempt int := 0;
BEGIN
  IF p_user_id IS NULL THEN
    RETURN;
  END IF;

  -- 已存在则直接返回
  IF EXISTS (SELECT 1 FROM crm.referral_codes WHERE user_id = p_user_id) THEN
    RETURN;
  END IF;

  -- 生成 8 位字母数字邀请码，冲突则重试
  WHILE NOT done AND attempt < 10 LOOP
    new_code := upper(
      substring(
        encode(gen_random_bytes(4), 'hex')
        || encode(gen_random_bytes(2), 'hex')
        from 1 for 8
      )
    );
    BEGIN
      INSERT INTO crm.referral_codes (user_id, referral_code)
      VALUES (p_user_id, new_code);
      done := true;
    EXCEPTION WHEN unique_violation THEN
      attempt := attempt + 1;
    END;
  END LOOP;
END;
$$;

COMMENT ON FUNCTION public.ensure_referral_code(uuid) IS '用户注册后调用：为该用户生成并写入 crm.referral_codes，已存在则跳过';

GRANT EXECUTE ON FUNCTION public.ensure_referral_code(uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.ensure_referral_code(uuid) TO authenticated;


-- ------------------------------
-- 2. 空间创建时：自动插入试用订单 + 分配给当前唯一运营
-- 在 public.spaces 上 AFTER INSERT 触发
-- ------------------------------
CREATE OR REPLACE FUNCTION crm.on_space_created()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = crm, public
AS $$
DECLARE
  v_sku_id uuid;
  v_ops_id uuid;
  v_expires_at timestamptz;
BEGIN
  -- 试用 SKU（VCH_TRIAL）
  SELECT id INTO v_sku_id FROM crm.sku_edition WHERE code = 'VCH_TRIAL' LIMIT 1;
  IF v_sku_id IS NULL THEN
    RAISE WARNING 'crm.on_space_created: VCH_TRIAL not found, skip trial order';
  ELSE
    v_expires_at := now() + interval '15 days';
    INSERT INTO crm.space_orders (space_id, sku_id, status, started_at, expires_at, source)
    VALUES (NEW.id, v_sku_id, 'active', now(), v_expires_at, 'registration');
  END IF;

  -- 分配给「当前唯一」运营人员（created_at 最早的一条）
  SELECT id INTO v_ops_id FROM crm.ops_users ORDER BY created_at ASC LIMIT 1;
  IF v_ops_id IS NOT NULL THEN
    INSERT INTO crm.ops_assignments (ops_user_id, space_id, role)
    VALUES (v_ops_id, NEW.id, 'primary')
    ON CONFLICT (space_id) DO UPDATE SET
      ops_user_id = EXCLUDED.ops_user_id,
      role = EXCLUDED.role;
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION crm.on_space_created() IS 'public.spaces 插入后：写 crm.space_orders（试用订单）与 crm.ops_assignments（分配给第一个运营）';

-- 删除旧 trigger 避免重复执行报错
DROP TRIGGER IF EXISTS crm_after_space_insert ON public.spaces;

CREATE TRIGGER crm_after_space_insert
  AFTER INSERT ON public.spaces
  FOR EACH ROW
  EXECUTE PROCEDURE crm.on_space_created();
