-- ============================================================
-- 线索与邀请表迁移：仅处理 ops_assignments（每空间一个运营）
-- 邀请码/邀请关系表已精简为 schema 中的新结构，无旧数据则直接执行 crm-schema.sql 即可
-- ============================================================

-- ops_assignments：每空间仅能分配给一个运营（UNIQUE space_id）
ALTER TABLE crm.ops_assignments
  DROP CONSTRAINT IF EXISTS ops_assignments_ops_user_id_space_id_key;

-- 去重：同一 space_id 只保留一条（按 assigned_at 取最新）
DELETE FROM crm.ops_assignments a
WHERE a.id NOT IN (
  SELECT (array_agg(id ORDER BY assigned_at DESC))[1]
  FROM crm.ops_assignments
  GROUP BY space_id
);

ALTER TABLE crm.ops_assignments
  ADD CONSTRAINT ops_assignments_space_id_key UNIQUE (space_id);
