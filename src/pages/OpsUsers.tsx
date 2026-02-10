import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
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

  useEffect(() => {
    load();
  }, []);

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
          仅在此表中的用户可登录 CRM。需先在 Supabase Auth 中创建用户，再在此表添加记录（user_id 对应 auth.users.id）。
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
                </tr>
              </thead>
              <tbody>
                {list.length === 0 && !loading ? (
                  <tr><td colSpan={5} style={{ textAlign: 'center', color: '#64748b', padding: '1.5rem' }}>暂无运营人员</td></tr>
                ) : list.map((row) => (
                  <tr key={row.id}>
                    <td>{row.email}</td>
                    <td>{row.name || '–'}</td>
                    <td>{ROLE_LABELS[row.role] ?? row.role}</td>
                    <td>{format(new Date(row.created_at), 'yyyy-MM-dd HH:mm')}</td>
                    <td>{format(new Date(row.updated_at), 'yyyy-MM-dd HH:mm')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
