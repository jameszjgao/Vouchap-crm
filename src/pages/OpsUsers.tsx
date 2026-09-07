import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { getCurrentOpsUser } from '../lib/ops-auth';
import { format } from 'date-fns';

interface OpsUserRow {
  id: string;
  user_id: string;
  email: string;
  name: string | null;
  role: string;
  created_at: string;
  updated_at: string;
}

const ROLE_LABELS: Record<string, string> = {
  admin: '管理员',
  ops: '运营',
  sales: '销售',
  support: '支持',
};

export default function OpsUsers() {
  const [list, setList] = useState<OpsUserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [resettingId, setResettingId] = useState<string | null>(null);
  const [resetMsg, setResetMsg] = useState<string | null>(null);

  useEffect(() => {
    load();
    getCurrentOpsUser().then((me) => setIsAdmin(me?.role === 'admin'));
  }, []);

  async function resetPassword(row: OpsUserRow) {
    const password = window.prompt(`为 ${row.email} 设置新的 Hub 密码（至少 8 位）`);
    if (!password) return;
    if (password.length < 8) {
      setResetMsg('密码至少 8 位');
      return;
    }
    setResettingId(row.user_id);
    setResetMsg(null);
    const { data, error } = await supabase.functions.invoke('ops-auth', {
      body: { action: 'set_password', user_id: row.user_id, password },
    });
    setResettingId(null);
    if (error || (data && typeof data === 'object' && 'error' in data && data.error)) {
      setResetMsg(error?.message || String((data as { error?: string })?.error || '重置失败'));
      return;
    }
    setResetMsg(`已更新 ${row.email} 的 Hub 密码。`);
  }

  async function load() {
    setLoading(true);
    const { data, error } = await supabase
      .schema('crm')
      .from('ops_users')
      .select('id, user_id, email, name, role, created_at, updated_at')
      .order('created_at', { ascending: false });
    if (!error) setList(data ?? []);
    setLoading(false);
  }

  return (
    <div>
      <h1 style={{ margin: '0 0 1rem', fontSize: '1.35rem' }}>运营人员</h1>
      <div className="page-card">
        <p style={{ margin: '0 0 0.75rem', fontSize: '0.9rem', color: '#64748b' }}>
          仅在此表中的用户可登录 CRM。需先在 Hub Auth 中创建用户，再在此表添加记录（user_id 对应 auth.users.id）。Hub 密码与 Vouchap 产品登录无关；管理员可在此直接设新密码（不依赖邮件）。
        </p>
        <div className="table-wrap">
          {loading ? (
            <p>加载中…</p>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>邮箱</th>
                  <th>姓名</th>
                  <th>角色</th>
                  <th>创建时间</th>
                  <th>更新时间</th>
                  {isAdmin && <th>操作</th>}
                </tr>
              </thead>
              <tbody>
                {list.length === 0 && !loading ? (
                  <tr><td colSpan={isAdmin ? 6 : 5} style={{ textAlign: 'center', color: '#64748b', padding: '1.5rem' }}>暂无运营人员</td></tr>
                ) : list.map((row) => (
                  <tr key={row.id}>
                    <td>{row.email}</td>
                    <td>{row.name || '–'}</td>
                    <td>{ROLE_LABELS[row.role] ?? row.role}</td>
                    <td>{format(new Date(row.created_at), 'yyyy-MM-dd HH:mm')}</td>
                    <td>{format(new Date(row.updated_at), 'yyyy-MM-dd HH:mm')}</td>
                    {isAdmin && (
                      <td>
                        <button
                          type="button"
                          className="btn btn-secondary btn-small"
                          disabled={resettingId === row.user_id}
                          onClick={() => resetPassword(row)}
                        >
                          {resettingId === row.user_id ? '设置中…' : '设新密码'}
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        {resetMsg && <p style={{ margin: '0.75rem 0 0', fontSize: '0.875rem' }}>{resetMsg}</p>}
      </div>
    </div>
  );
}
