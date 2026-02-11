import { useState, useEffect, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import type { OpsUser } from '../lib/ops-auth';
import { format } from 'date-fns';
import { Plus, Trash2 } from 'lucide-react';

interface AssignmentRow {
  id: string;
  ops_user_id: string;
  space_id: string;
  role: string;
  assigned_at: string;
  ops_users?: { name: string | null; email: string } | null;
}

interface AssignmentsProps {
  opsUser: OpsUser | null;
}

export default function Assignments({ opsUser }: AssignmentsProps) {
  const [list, setList] = useState<AssignmentRow[]>([]);
  const [spaces, setSpaces] = useState<{ id: string; name: string | null }[]>([]);
  const [opsUsers, setOpsUsers] = useState<OpsUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);
  const [newSpaceId, setNewSpaceId] = useState('');
  const [newOpsUserId, setNewOpsUserId] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const spaceNameById = useMemo(() => {
    const m: Record<string, string> = {};
    spaces.forEach((s) => { m[s.id] = s.name || s.id.slice(0, 8) + '…'; });
    return m;
  }, [spaces]);

  const isAdmin = opsUser?.role === 'admin';

  useEffect(() => {
    load();
  }, [opsUser?.id, isAdmin]);

  async function load() {
    setLoading(true);
    try {
      const [assignmentsRes, spacesRes, usersRes] = await Promise.all([
        supabase.schema('crm').from('ops_assignments').select(`
          id, ops_user_id, space_id, role, assigned_at,
          ops_users(name, email)
        `).order('assigned_at', { ascending: false }).limit(200),
        supabase.from('spaces').select('id, name').order('created_at', { ascending: false }).limit(500),
        isAdmin ? supabase.schema('crm').from('ops_users').select('id, user_id, email, name, role, created_at, updated_at').order('email') : Promise.resolve({ data: [] as OpsUser[], error: null }),
      ]);
      if (!assignmentsRes.error) {
        const raw = (assignmentsRes.data ?? []) as unknown as AssignmentRow[];
        setList(isAdmin ? raw : raw.filter((a) => a.ops_user_id === opsUser?.id));
      }
      if (!spacesRes.error) setSpaces(spacesRes.data ?? []);
      if (isAdmin && usersRes && !(usersRes as { error: unknown }).error)
        setOpsUsers(((usersRes as { data: OpsUser[] }).data ?? []).map((u) => ({ ...u, created_at: String(u.created_at), updated_at: String((u as { updated_at?: unknown }).updated_at ?? '') })));
    } finally {
      setLoading(false);
    }
  }

  async function handleAdd() {
    if (!newSpaceId || !newOpsUserId) return;
    setSubmitting(true);
    try {
      const { error } = await supabase.schema('crm').from('ops_assignments').upsert(
        { space_id: newSpaceId, ops_user_id: newOpsUserId, role: 'primary' },
        { onConflict: 'space_id' }
      );
      if (!error) {
        setShowNew(false);
        setNewSpaceId('');
        setNewOpsUserId('');
        load();
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function handleRemove(id: string) {
    setDeletingId(id);
    try {
      const { error } = await supabase.schema('crm').from('ops_assignments').delete().eq('id', id);
      if (!error) load();
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div>
      <h1 style={{ margin: '0 0 1rem', fontSize: '1.35rem' }}>{isAdmin ? '客户分配' : '我的客户分配'}</h1>
      <div className="page-card">
        <p style={{ margin: '0 0 0.75rem', fontSize: '0.9rem', color: '#64748b' }}>
          {isAdmin ? '将客户分配给运营人员负责（主责/协办）。每个客户仅能分配给一名运营。' : '仅展示分配给我的客户。'}
        </p>
        {isAdmin && (
          <div style={{ marginBottom: '1rem' }}>
            <button type="button" className="btn btn-primary" onClick={() => setShowNew(true)}>
              <Plus size={18} style={{ verticalAlign: 'middle', marginRight: 6 }} />
              新增分配
            </button>
          </div>
        )}
        <div className="table-wrap">
          {loading ? (
            <p>加载中…</p>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>客户</th>
                  <th>运营人员</th>
                  <th>角色</th>
                  <th>分配时间</th>
                  {isAdmin && <th>操作</th>}
                </tr>
              </thead>
              <tbody>
                {list.length === 0 && !loading ? (
                  <tr><td colSpan={isAdmin ? 5 : 4} style={{ textAlign: 'center', color: '#64748b', padding: '1.5rem' }}>暂无分配记录</td></tr>
                ) : list.map((row) => (
                  <tr key={row.id}>
                    <td>{spaceNameById[row.space_id] ?? row.space_id.slice(0, 8) + '…'}</td>
                    <td>{row.ops_users ? (row.ops_users.name || row.ops_users.email) : row.ops_user_id}</td>
                    <td>{row.role === 'primary' ? '主责' : '协办'}</td>
                    <td>{format(new Date(row.assigned_at), 'yyyy-MM-dd HH:mm')}</td>
                    {isAdmin && (
                      <td>
                        <button
                          type="button"
                          className="btn btn-secondary btn-small"
                          onClick={() => handleRemove(row.id)}
                          disabled={deletingId === row.id}
                        >
                          <Trash2 size={14} style={{ verticalAlign: 'middle' }} /> 取消
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {showNew && (
        <div className="modal-overlay" onClick={() => !submitting && setShowNew(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <h3 style={{ margin: '0 0 1rem' }}>新增分配</h3>
            <label style={{ display: 'block', marginBottom: '0.75rem' }}>
              <span style={{ display: 'block', marginBottom: 4, fontSize: '0.875rem' }}>客户</span>
              <select
                value={newSpaceId}
                onChange={(e) => setNewSpaceId(e.target.value)}
                style={{ width: '100%', padding: '0.5rem', borderRadius: 6 }}
              >
                <option value="">请选择</option>
                {spaces.map((s) => (
                  <option key={s.id} value={s.id}>{s.name || s.id.slice(0, 8)}</option>
                ))}
              </select>
            </label>
            <label style={{ display: 'block', marginBottom: '0.75rem' }}>
              <span style={{ display: 'block', marginBottom: 4, fontSize: '0.875rem' }}>运营人员</span>
              <select
                value={newOpsUserId}
                onChange={(e) => setNewOpsUserId(e.target.value)}
                style={{ width: '100%', padding: '0.5rem', borderRadius: 6 }}
              >
                <option value="">请选择</option>
                {opsUsers.map((u) => (
                  <option key={u.id} value={u.id}>{u.name || u.email} ({u.role})</option>
                ))}
              </select>
            </label>
            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
              <button type="button" className="btn btn-secondary" onClick={() => setShowNew(false)} disabled={submitting}>取消</button>
              <button type="button" className="btn btn-primary" onClick={handleAdd} disabled={submitting || !newSpaceId || !newOpsUserId}>
                {submitting ? '提交中…' : '确定'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
