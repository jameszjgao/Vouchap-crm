-- One-time privilege only on the frozen Vouchap project (giuacjbfsyrristkigmz).
-- Does not create/alter tables or change the Vouchap app.
-- Lets Hub product-ops (service_role) read/write existing CRM order tables.

GRANT USAGE ON SCHEMA crm TO service_role;

GRANT SELECT, INSERT, UPDATE ON TABLE crm.space_orders TO service_role;
GRANT SELECT ON TABLE crm.sku_edition TO service_role;
GRANT SELECT ON TABLE crm.sku_addon TO service_role;
GRANT SELECT ON TABLE crm.ops_users TO service_role;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'crm' AND table_name = 'ops_assignments'
  ) THEN
    GRANT SELECT ON TABLE crm.ops_assignments TO service_role;
  END IF;
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'crm' AND table_name = 'space_follow_ups'
  ) THEN
    GRANT SELECT ON TABLE crm.space_follow_ups TO service_role;
  END IF;
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'crm' AND table_name = 'space_order_addons'
  ) THEN
    GRANT SELECT ON TABLE crm.space_order_addons TO service_role;
  END IF;
END $$;

GRANT EXECUTE ON FUNCTION crm.get_space_entitlements(uuid) TO service_role;
