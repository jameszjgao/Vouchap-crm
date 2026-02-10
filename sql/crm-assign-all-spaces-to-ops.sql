-- ============================================================
-- 将现有客户（public.spaces）全部分配给「当前仅有的」运营人员
-- 在 Supabase SQL Editor 中执行（建议用 service_role 或具备 crm 写权限的账号）
-- ============================================================

-- 若存在多条运营人员，只会取一条（ORDER BY 可改成按 email 等固定顺序）
INSERT INTO crm.ops_assignments (ops_user_id, space_id, role)
SELECT
  (SELECT id FROM crm.ops_users ORDER BY created_at ASC LIMIT 1),
  s.id,
  'primary'
FROM public.spaces s
ON CONFLICT (space_id) DO UPDATE SET
  ops_user_id = EXCLUDED.ops_user_id,
  role = EXCLUDED.role;

-- 查看结果（可选）
-- SELECT COUNT(*) AS assigned_count FROM crm.ops_assignments;
