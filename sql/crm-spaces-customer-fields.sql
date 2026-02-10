-- ============================================================
-- 客户列表增强：创建者、空间人数、跟进记录
-- 1. public.spaces 增加 created_by（主应用创建空间时设置，用于展示创建者）
-- 2. CRM 运营可读 public.users、public.user_spaces（创建者姓名/邮箱、成员数）
-- 3. crm.space_follow_ups 跟进记录表
-- 在 Supabase SQL Editor 中执行
-- ============================================================

-- 1. 为 public.spaces 增加 created_by（仅当 public.users 存在且 spaces 尚无此列时）
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'users')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'spaces' AND column_name = 'created_by') THEN
    ALTER TABLE public.spaces
      ADD COLUMN created_by uuid REFERENCES public.users(id) ON DELETE SET NULL;
    COMMENT ON COLUMN public.spaces.created_by IS '空间创建者，对应 public.users.id，CRM 用于展示创建者姓名/邮箱';
  END IF;
END $$;

-- 2. 允许 CRM 运营读取 public.users（需主应用存在 public.users 表）
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS crm_ops_can_read_users ON public.users;
CREATE POLICY crm_ops_can_read_users ON public.users
  FOR SELECT
  TO authenticated
  USING (crm.current_ops_user_role() IS NOT NULL);

-- 3. 允许 CRM 运营读取 public.user_spaces（需主应用存在 public.user_spaces 表）
ALTER TABLE public.user_spaces ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS crm_ops_can_read_user_spaces ON public.user_spaces;
CREATE POLICY crm_ops_can_read_user_spaces ON public.user_spaces
  FOR SELECT
  TO authenticated
  USING (crm.current_ops_user_role() IS NOT NULL);

-- 4. 跟进记录表
CREATE TABLE IF NOT EXISTS crm.space_follow_ups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  space_id uuid NOT NULL,
  ops_user_id uuid NOT NULL REFERENCES crm.ops_users(id) ON DELETE CASCADE,
  content text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_space_follow_ups_space ON crm.space_follow_ups(space_id);
CREATE INDEX IF NOT EXISTS idx_space_follow_ups_created ON crm.space_follow_ups(space_id, created_at DESC);

COMMENT ON TABLE crm.space_follow_ups IS '客户跟进记录：运营对某客户的备注/跟进内容';

ALTER TABLE crm.space_follow_ups ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS space_follow_ups_ops ON crm.space_follow_ups;
CREATE POLICY space_follow_ups_ops ON crm.space_follow_ups FOR ALL USING (
  EXISTS (SELECT 1 FROM crm.ops_users WHERE user_id = auth.uid())
);

GRANT SELECT, INSERT, UPDATE, DELETE ON crm.space_follow_ups TO authenticated;
