/**
 * Set a Hub Auth password for an existing crm.ops_users email.
 * Env: HUB_URL, HUB_SERVICE_ROLE_KEY, OPS_EMAIL, OPS_PASSWORD
 */
import { createClient } from '@supabase/supabase-js';

const hubUrl = process.env.HUB_URL;
const hubKey = process.env.HUB_SERVICE_ROLE_KEY;
const email = (process.env.OPS_EMAIL ?? '').trim().toLowerCase();
const password = process.env.OPS_PASSWORD ?? '';

if (!hubUrl || !hubKey || !email || password.length < 8) {
  throw new Error('Need HUB_URL, HUB_SERVICE_ROLE_KEY, OPS_EMAIL, OPS_PASSWORD (>=8)');
}

const hub = createClient(hubUrl, hubKey, { auth: { persistSession: false, autoRefreshToken: false } });

const { data: ops, error: opsErr } = await hub.schema('crm').from('ops_users').select('user_id, email, role').ilike('email', email).maybeSingle();
if (opsErr) throw opsErr;
if (!ops?.user_id) throw new Error(`No crm.ops_users row for ${email}`);

const { error } = await hub.auth.admin.updateUserById(ops.user_id, {
  password,
  email_confirm: true,
});
if (error) throw error;

const anonKey = process.env.HUB_ANON_KEY;
if (anonKey) {
  const anon = createClient(hubUrl, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const signed = await anon.auth.signInWithPassword({ email, password });
  if (signed.error) throw new Error(`verify login failed: ${signed.error.message}`);
}

console.log(JSON.stringify({ ok: true, email, role: ops.role, verified: Boolean(anonKey) }));
