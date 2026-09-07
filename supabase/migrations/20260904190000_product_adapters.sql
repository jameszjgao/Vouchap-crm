-- Server-only product adapter credentials. Used by product-ops when Function
-- secrets are unavailable. Never grant to anon / authenticated.

CREATE TABLE IF NOT EXISTS crm.product_adapters (
  product_id text PRIMARY KEY REFERENCES crm.products (id) ON DELETE CASCADE,
  supabase_url text NOT NULL,
  service_role_key text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS trg_hub_product_adapters_touch ON crm.product_adapters;
CREATE TRIGGER trg_hub_product_adapters_touch
  BEFORE UPDATE ON crm.product_adapters
  FOR EACH ROW EXECUTE FUNCTION crm.touch_updated_at();

ALTER TABLE crm.product_adapters ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE crm.product_adapters FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE crm.product_adapters TO service_role;

COMMENT ON TABLE crm.product_adapters IS
  'Hub-only service credentials for product DBs. Readable solely by service_role / product-ops.';
