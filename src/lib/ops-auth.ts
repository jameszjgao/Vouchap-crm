import { supabase } from './supabase';

export interface OpsUser {
  id: string;
  user_id: string;
  email: string;
  name: string | null;
  role: string;
  created_at: string;
  updated_at: string;
}

/**
 * 用当前登录用户的 auth.uid() 查 crm.ops_users，RLS 策略允许 user_id = auth.uid() 时 SELECT。
 * 只走直接查表，不依赖 Edge Function。
 */
export async function getCurrentOpsUser(): Promise<OpsUser | null> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user?.id) return null;

    const { data, error } = await supabase
      .schema('crm')
      .from('ops_users')
      .select('id, user_id, email, name, role, created_at, updated_at')
      .eq('user_id', session.user.id)
      .maybeSingle();

    if (error || !data) return null;
    return {
      id: data.id,
      user_id: data.user_id,
      email: data.email,
      name: data.name ?? null,
      role: data.role ?? 'viewer',
      created_at: String(data.created_at ?? ''),
      updated_at: String(data.updated_at ?? ''),
    };
  } catch {
    return null;
  }
}

export async function signOut(): Promise<void> {
  await supabase.auth.signOut();
}
