-- ============================================================
-- 为 CRM 前端授权：可读/写 crm.space_orders、crm.ops_assignments、可读 sku_edition/sku_addon
-- 若只跑过 crm-schema 或旧版 crm-expose-schema，订单/权益包页会无数据，执行本脚本即可
--
-- 重要：执行本脚本后若前端仍无订单/SKU 数据，请到 Supabase 控制台：
--   Project Settings → API → Exposed schemas → 添加 crm
-- 否则 PostgREST 不会暴露 crm schema，前端请求会 404 或报错
-- ============================================================

GRANT USAGE ON SCHEMA crm TO authenticated;

-- 客户订单：运营可查、可新建
GRANT SELECT, INSERT ON crm.space_orders TO authenticated;

-- 客户分配：运营可查、可新增/改派/取消
GRANT SELECT, INSERT, UPDATE, DELETE ON crm.ops_assignments TO authenticated;

-- 权益包页：运营可读（若权益包仍无数据，说明未执行过 crm-expose-schema 或需本段）
GRANT SELECT ON crm.sku_edition TO authenticated;
GRANT SELECT ON crm.sku_addon TO authenticated;
