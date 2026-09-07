/**
 * One-time: copy Vouchap ops users / assignments / follow-ups onto Hub Auth + crm.
 * Does not write to the Vouchap database.
 *
 * Env: HUB_URL, HUB_SERVICE_ROLE_KEY, VOUCHAP_URL, VOUCHAP_SERVICE_ROLE_KEY
 */
import { createClient } from '@supabase/supabase-js';
import { randomBytes } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const hubUrl = process.env.HUB_URL;
const hubKey = process.env.HUB_SERVICE_ROLE_KEY;
const vchUrl = process.env.VOUCHAP_URL;
const vchKey = process.env.VOUCHAP_SERVICE_ROLE_KEY;

if (!hubUrl || !hubKey || !vchUrl || !vchKey) {
  throw new Error('Missing HUB_* or VOUCHAP_* env');
}

const hub = createClient(hubUrl, hubKey, { auth: { persistSession: false, autoRefreshToken: false } });
const vch = createClient(vchUrl, vchKey, { auth: { persistSession: false, autoRefreshToken: false } });

function randPassword() {
  return `Adaven-${randomBytes(12).toString('base64url')}`;
}

async function findAuthUserByEmail(email) {
  const target = email.trim().toLowerCase();
  let page = 1;
  for (;;) {
    const { data, error } = await hub.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const hit = (data.users ?? []).find((u) => (u.email ?? '').toLowerCase() === target);
    if (hit) return hit;
    if (!data.users?.length || data.users.length < 200) return null;
    page += 1;
  }
}

const { error: adapterErr } = await hub.schema('crm').from('product_adapters').upsert({
  product_id: 'vouchap',
  supabase_url: vchUrl,
  service_role_key: vchKey,
});
if (adapterErr) throw adapterErr;

const { data: opsRows, error: opsErr } = await vch.schema('crm').from('ops_users').select(
  'id, user_id, email, name, role, created_at, updated_at',
);
if (opsErr) throw opsErr;

let assignRows = [];
const assignRes = await vch.schema('crm').from('ops_assignments').select(
  'space_id, ops_user_id, role, assigned_at',
);
if (assignRes.error) {
  console.warn('vouchap ops_assignments skipped:', assignRes.error.message);
} else {
  assignRows = assignRes.data ?? [];
}

let followRows = [];
const followRes = await vch.schema('crm').from('space_follow_ups').select(
  'space_id, ops_user_id, content, created_at',
);
if (followRes.error) {
  console.warn('vouchap space_follow_ups skipped:', followRes.error.message);
} else {
  followRows = followRes.data ?? [];
}

const bootstrap = [];
const oldToNewOpsId = new Map();

for (const row of opsRows ?? []) {
  const email = String(row.email ?? '').trim();
  if (!email) continue;
  let user = await findAuthUserByEmail(email);
  let password = null;
  if (!user) {
    password = randPassword();
    const created = await hub.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { name: row.name ?? null },
    });
    if (created.error) throw created.error;
    user = created.data.user;
  }
  if (!user?.id) throw new Error(`No Hub auth user for ${email}`);

  const { data: existing } = await hub.schema('crm').from('ops_users').select('id').eq('user_id', user.id).maybeSingle();
  let newOpsId = existing?.id;
  if (!newOpsId) {
    const { data: inserted, error: insErr } = await hub.schema('crm').from('ops_users').insert({
      user_id: user.id,
      email,
      name: row.name ?? null,
      role: row.role || 'ops',
    }).select('id').single();
    if (insErr) throw insErr;
    newOpsId = inserted.id;
  }
  oldToNewOpsId.set(row.id, newOpsId);
  bootstrap.push({ email, role: row.role, password, createdAuth: Boolean(password) });
}

for (const a of assignRows ?? []) {
  const opsId = oldToNewOpsId.get(a.ops_user_id);
  if (!opsId || !a.space_id) continue;
  const { error } = await hub.schema('crm').from('ops_assignments').upsert({
    product_id: 'vouchap',
    tenant_id: a.space_id,
    ops_user_id: opsId,
    role: a.role || 'primary',
    assigned_at: a.assigned_at,
  }, { onConflict: 'product_id,tenant_id' });
  if (error) throw error;
}

for (const f of followRows) {
  const opsId = oldToNewOpsId.get(f.ops_user_id) ?? null;
  if (!f.space_id || !f.content) continue;
  const { error } = await hub.schema('crm').from('tenant_follow_ups').insert({
    product_id: 'vouchap',
    tenant_id: f.space_id,
    ops_user_id: opsId,
    content: f.content,
    created_at: f.created_at,
  });
  if (error && !/duplicate/i.test(error.message)) {
    // Follow-ups have no unique key; skip only hard failures
    console.warn('follow-up skip', error.message);
  }
}

const dir = join(dirname(fileURLToPath(import.meta.url)), '..', '.local');
mkdirSync(dir, { recursive: true });
writeFileSync(join(dir, 'ops-bootstrap.json'), `${JSON.stringify({
  note: 'Hub Auth passwords for newly created users only. Existing Hub users keep their password. Change these after first login.',
  users: bootstrap,
}, null, 2)}\n`);

console.log(JSON.stringify({
  adapter: 'vouchap',
  opsCopied: bootstrap.length,
  emails: bootstrap.map((u) => u.email),
  assignments: (assignRows ?? []).length,
  followUps: followRows.length,
  newAuthUsers: bootstrap.filter((u) => u.createdAuth).length,
  passwordFile: '.local/ops-bootstrap.json',
}, null, 2));
