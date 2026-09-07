/**
 * Upsert Hub crm.product_adapters for products that have local key files.
 * Does not print secrets. Env: HUB_URL, HUB_SERVICE_ROLE_KEY
 * Optional per-product: PORTALFLOW_URL + PORTALFLOW_SERVICE_ROLE_KEY, etc.
 */
import { createClient } from '@supabase/supabase-js';

const PRODUCTS = [
  { id: 'vouchap', url: process.env.VOUCHAP_URL, key: process.env.VOUCHAP_SERVICE_ROLE_KEY },
  { id: 'portalflow', url: process.env.PORTALFLOW_URL, key: process.env.PORTALFLOW_SERVICE_ROLE_KEY },
  { id: 'wholestore', url: process.env.WHOLESTORE_URL, key: process.env.WHOLESTORE_SERVICE_ROLE_KEY },
  { id: 'aimlink', url: process.env.AIMLINK_URL, key: process.env.AIMLINK_SERVICE_ROLE_KEY },
];

const hubUrl = process.env.HUB_URL;
const hubKey = process.env.HUB_SERVICE_ROLE_KEY;
if (!hubUrl || !hubKey) throw new Error('Missing HUB_URL / HUB_SERVICE_ROLE_KEY');

const hub = createClient(hubUrl, hubKey, { auth: { persistSession: false, autoRefreshToken: false } });
const written = [];

for (const p of PRODUCTS) {
  if (!p.url || !p.key) continue;
  const { error } = await hub.schema('crm').from('product_adapters').upsert({
    product_id: p.id,
    supabase_url: p.url,
    service_role_key: p.key,
  });
  if (error) throw new Error(`${p.id}: ${error.message}`);
  written.push(p.id);
}

if (!written.length) throw new Error('No product credentials in env');
console.log(JSON.stringify({ ok: true, adapters: written }));
