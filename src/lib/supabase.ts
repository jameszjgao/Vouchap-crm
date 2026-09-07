import { createClient } from '@supabase/supabase-js';

const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL ?? '').trim();
const supabaseAnonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY ?? '').trim();

export const hubConfigured = Boolean(supabaseUrl && supabaseAnonKey);

if (!hubConfigured) {
  console.error('[Adaven-CRM] Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY (required at build time on Vercel).');
}

export const supabase = createClient(
  hubConfigured ? supabaseUrl : 'https://glwacznypahmlpwottfz.supabase.co',
  hubConfigured ? supabaseAnonKey : 'missing-anon-key',
);
