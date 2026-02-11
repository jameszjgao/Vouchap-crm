import { useState, useEffect, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import type { OpsUser } from '../lib/ops-auth';
import { format } from 'date-fns';
import { UserPlus, X } from 'lucide-react';

interface SpaceRow {
  id: string;
  name: string | null;
  created_at: string;
}

interface AssignmentRow {
  space_id: string;
  ops_user_id: string;
  role: string;
  assigned_at: string;
  ops_users?: { name: string | null; email: string } | null;
}

interface OrderRow {
  id: string;
  space_id: string;
  status: string;
  expires_at: string | null;
  created_at: string;
  sku_edition?: { name: string | null } | null;
}

interface FollowUpRow {
  id: string;
  space_id: string;
  ops_user_id: string;
  content: string;
  created_at: string;
  ops_users?: { name: string | null; email: string } | null;
}

interface CreatorRow {
  id: string;
  email: string | null;
  name: string | null;
}

interface LeadsProps {
  opsUser: OpsUser | null;
  view: 'all' | 'my';
}

export default function Leads({ opsUser, view }: LeadsProps) {
  const [spaces, setSpaces] = useState<SpaceRow[]>([]);
  const [assignments, setAssignments] = useState<AssignmentRow[]>([]);
  const [opsUsers, setOpsUsers] = useState<OpsUser[]>([]);
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [userSpacesRaw, setUserSpacesRaw] = useState<{ space_id: string; user_id: string; is_admin: boolean }[]>([]);
  const [creators, setCreators] = useState<CreatorRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [assigningSpaceId, setAssigningSpaceId] = useState<string | null>(null);
  const [selectedOpsUserId, setSelectedOpsUserId] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [selectedSpaceId, setSelectedSpaceId] = useState<string | null>(null);
  const [searchName, setSearchName] = useState('');
  const [searchCreatorEmail, setSearchCreatorEmail] = useState('');
  const [filterMemberMin, setFilterMemberMin] = useState('');
  const [filterMemberMax, setFilterMemberMax] = useState('');
  const [filterSku, setFilterSku] = useState('');
  const [filterOpsUserId, setFilterOpsUserId] = useState('');
  const [filterCreatedStart, setFilterCreatedStart] = useState('');
  const [filterCreatedEnd, setFilterCreatedEnd] = useState('');
  const [dataTotalBySpaceId, setDataTotalBySpaceId] = useState<Record<string, number>>({});

  const isAll = view === 'all';
  const assignmentBySpaceId = useMemo(() => {
    const m: Record<string, AssignmentRow> = {};
    assignments.forEach((a) => { m[a.space_id] = a; });
    return m;
  }, [assignments]);

  const memberCountBySpaceId = useMemo(() => {
    const m: Record<string, number> = {};
    userSpacesRaw.forEach((r) => { m[r.space_id] = (m[r.space_id] ?? 0) + 1; });
    return m;
  }, [userSpacesRaw]);

  // 创建者 = space 的管理员（user_spaces.is_admin = true）
  const adminUserIdBySpaceId = useMemo(() => {
    const m: Record<string, string> = {};
    userSpacesRaw.forEach((r) => {
      if (r.is_admin && !m[r.space_id]) {
        m[r.space_id] = r.user_id;
      }
    });
    return m;
  }, [userSpacesRaw]);

  const currentSkuBySpaceId = useMemo(() => {
    const now = new Date();
    const bySpace: Record<string, string> = {};
    orders
      .filter((o) => o.status === 'active' && (!o.expires_at || new Date(o.expires_at) > now))
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .forEach((o) => {
        if (bySpace[o.space_id] == null)
          bySpace[o.space_id] = o.sku_edition?.name ?? '–';
      });
    return bySpace;
  }, [orders]);

  const creatorById = useMemo(() => {
    const m: Record<string, CreatorRow> = {};
    creators.forEach((c) => { m[c.id] = c; });
    return m;
  }, [creators]);

  const distinctSkuNames = useMemo(() => {
    const set = new Set<string>();
    Object.values(currentSkuBySpaceId).forEach((n) => { if (n && n !== '–') set.add(n); });
    return Array.from(set).sort();
  }, [currentSkuBySpaceId]);

  const filteredSpaces = useMemo(() => {
    return spaces.filter((s) => {
      // 搜索：客户名称、创建人邮箱均不区分大小写
      if (searchName.trim()) {
        const name = (s.name ?? '').toLowerCase();
        if (!name.includes(searchName.trim().toLowerCase())) return false;
      }
      const creatorUserId = adminUserIdBySpaceId[s.id];
      const creator = creatorUserId ? creatorById[creatorUserId] : null;
      const creatorEmail = creator?.email ?? '';
      if (searchCreatorEmail.trim() && !creatorEmail.toLowerCase().includes(searchCreatorEmail.trim().toLowerCase())) return false;
      const members = memberCountBySpaceId[s.id] ?? 0;
      const min = filterMemberMin !== '' ? Number(filterMemberMin) : null;
      const max = filterMemberMax !== '' ? Number(filterMemberMax) : null;
      if (min != null && members < min) return false;
      if (max != null && members > max) return false;
      const sku = currentSkuBySpaceId[s.id] ?? '–';
      if (filterSku && sku !== filterSku) return false;
      if (filterOpsUserId) {
        const a = assignmentBySpaceId[s.id];
        if (a?.ops_user_id !== filterOpsUserId) return false;
      }
      if (filterCreatedStart) {
        const start = new Date(filterCreatedStart + 'T00:00:00').getTime();
        if (new Date(s.created_at).getTime() < start) return false;
      }
      if (filterCreatedEnd) {
        const end = new Date(filterCreatedEnd + 'T23:59:59.999').getTime();
        if (new Date(s.created_at).getTime() > end) return false;
      }
      return true;
    });
  }, [spaces, searchName, searchCreatorEmail, filterMemberMin, filterMemberMax, filterSku, filterOpsUserId, filterCreatedStart, filterCreatedEnd, creatorById, memberCountBySpaceId, currentSkuBySpaceId, adminUserIdBySpaceId, assignmentBySpaceId]);

  useEffect(() => {
    load();
  }, [opsUser?.id, view]);

  async function load() {
    setLoading(true);
    try {
      const [spacesRes, assignmentsRes, usersRes, ordersRes, usRes] = await Promise.all([
        supabase.from('spaces').select('id, name, created_at').order('created_at', { ascending: false }).limit(500),
        supabase.schema('crm').from('ops_assignments').select('space_id, ops_user_id, role, assigned_at, ops_users(name, email)').order('assigned_at', { ascending: false }),
        view === 'all' ? supabase.schema('crm').from('ops_users').select('id, user_id, email, name, role, created_at, updated_at').order('email') : Promise.resolve({ data: [] as OpsUser[], error: null }),
        supabase.schema('crm').from('space_orders').select('id, space_id, status, expires_at, created_at, sku_edition(name)').order('created_at', { ascending: false }),
        supabase.from('user_spaces').select('space_id, user_id, is_admin'),
      ]);

      const allAssignments = (assignmentsRes.data ?? []) as unknown as AssignmentRow[];
      if (!assignmentsRes.error) setAssignments(allAssignments);
      if (view === 'all' && usersRes && !(usersRes as { error: unknown }).error)
        setOpsUsers(((usersRes as { data: OpsUser[] }).data ?? []).map((u) => ({ ...u, created_at: String(u.created_at), updated_at: String((u as { updated_at?: unknown }).updated_at ?? '') })));

      if (!ordersRes.error) setOrders((ordersRes.data ?? []) as unknown as OrderRow[]);

      if (!usRes.error) {
        const rows = (usRes.data ?? []) as { space_id: string; user_id: string; is_admin: boolean }[];
        setUserSpacesRaw(rows);
        const adminIds = [...new Set(rows.filter((r) => r.is_admin).map((r) => r.user_id))];
        if (adminIds.length > 0) {
          const uRes = await supabase.from('users').select('id, email, name').in('id', adminIds);
          if (!uRes.error) setCreators((uRes.data ?? []) as CreatorRow[]);
          else setCreators([]);
        } else {
          setCreators([]);
        }
      } else {
        setUserSpacesRaw([]);
        setCreators([]);
      }

      let allSpaces: SpaceRow[] = [];
      if (!spacesRes.error) {
        allSpaces = (spacesRes.data ?? []) as SpaceRow[];
      }

      let finalSpaces: SpaceRow[] = [];
      if (allSpaces.length > 0) {
        if (view === 'all') {
          finalSpaces = allSpaces;
          setSpaces(allSpaces);
        } else if (opsUser?.id) {
          const mySpaceIds = new Set(allAssignments.filter((a) => a.ops_user_id === opsUser.id).map((a) => a.space_id));
          finalSpaces = allSpaces.filter((s) => mySpaceIds.has(s.id));
          setSpaces(finalSpaces);
        } else {
          setSpaces([]);
        }
      } else {
        setSpaces([]);
      }

      if (finalSpaces.length > 0) {
        const ids = finalSpaces.map((s) => s.id);
        let bySpace: Record<string, number> = {};
        const { data: totalsData, error: totalsError } = await supabase.rpc('get_spaces_data_totals', { p_space_ids: ids });
        if (!totalsError && Array.isArray(totalsData)) {
          (totalsData as { space_id?: string; total?: number | string }[]).forEach((r) => {
            const sid = r.space_id ?? (r as Record<string, unknown>).space_id as string | undefined;
            const t = r.total ?? (r as Record<string, unknown>).total;
            if (sid != null) bySpace[sid] = Number(t) || 0;
          });
        }
        if (totalsError) console.warn('get_spaces_data_totals 未生效，改用单空间统计:', totalsError.message);
        if (Object.keys(bySpace).length === 0 && ids.length > 0) {
          const results = await Promise.all(
            ids.map((spaceId) =>
              supabase.rpc('get_space_data_stats', { p_space_id: spaceId }).then((res) => ({ spaceId, data: res.data }))
            )
          );
          results.forEach(({ spaceId, data }) => {
            if (data && typeof data === 'object' && !Array.isArray(data)) {
              const d = data as { receipts?: number; invoices?: number; inbound?: number; outbound?: number };
              bySpace[spaceId] = (Number(d.receipts) || 0) + (Number(d.invoices) || 0) + (Number(d.inbound) || 0) + (Number(d.outbound) || 0);
            }
          });
        }
        setDataTotalBySpaceId(bySpace);
      } else {
        setDataTotalBySpaceId({});
      }
    } catch {
      setSpaces([]);
      setDataTotalBySpaceId({});
    } finally {
      setLoading(false);
    }
  }

  async function handleAssign() {
    if (!assigningSpaceId || !selectedOpsUserId) return;
    setSubmitting(true);
    try {
      const { error } = await supabase
        .schema('crm')
        .from('ops_assignments')
        .upsert(
          { space_id: assigningSpaceId, ops_user_id: selectedOpsUserId, role: 'primary' },
          { onConflict: 'space_id' }
        );
      if (!error) {
        setAssigningSpaceId(null);
        setSelectedOpsUserId('');
        load();
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div>
      <h1 style={{ margin: '0 0 1rem', fontSize: '1.35rem' }}>{isAll ? '全部客户' : '我的客户'}</h1>
      <div className="page-card">
        <p style={{ margin: '0 0 0.75rem', fontSize: '0.9rem', color: '#64748b' }}>
          {isAll ? '全部客户列表，可分配负责人。' : '仅展示分配给我的客户。'}
          {isAll && ' 支持按条件搜索与筛选，结果中可对客户进行改派。'}
        </p>

        <div style={{ marginBottom: '1rem' }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', alignItems: 'center', marginBottom: '0.5rem' }}>
            <span style={{ fontSize: '0.875rem', color: '#64748b', fontWeight: 500 }}>搜索：</span>
            <input
              type="text"
              placeholder="客户名称"
              value={searchName}
              onChange={(e) => setSearchName(e.target.value)}
              style={{ width: 160, padding: '0.35rem 0.5rem', borderRadius: 6, border: '1px solid #e2e8f0', fontSize: '0.875rem' }}
            />
            <input
              type="text"
              placeholder="创建人邮箱"
              value={searchCreatorEmail}
              onChange={(e) => setSearchCreatorEmail(e.target.value)}
              style={{ width: 180, padding: '0.35rem 0.5rem', borderRadius: 6, border: '1px solid #e2e8f0', fontSize: '0.875rem' }}
            />
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', alignItems: 'center' }}>
            <span style={{ fontSize: '0.875rem', color: '#64748b', fontWeight: 500 }}>筛选：</span>
            <input
              type="number"
              placeholder="人数≥"
              min={0}
              value={filterMemberMin}
              onChange={(e) => setFilterMemberMin(e.target.value)}
              style={{ width: 72, padding: '0.35rem 0.5rem', borderRadius: 6, border: '1px solid #e2e8f0', fontSize: '0.875rem' }}
            />
            <input
              type="number"
              placeholder="人数≤"
              min={0}
              value={filterMemberMax}
              onChange={(e) => setFilterMemberMax(e.target.value)}
              style={{ width: 72, padding: '0.35rem 0.5rem', borderRadius: 6, border: '1px solid #e2e8f0', fontSize: '0.875rem' }}
            />
            <select
              value={filterSku}
              onChange={(e) => setFilterSku(e.target.value)}
              style={{ padding: '0.35rem 0.5rem', borderRadius: 6, border: '1px solid #e2e8f0', fontSize: '0.875rem', minWidth: 120 }}
            >
              <option value="">全部规格</option>
              {distinctSkuNames.map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
            {isAll && (
              <select
                value={filterOpsUserId}
                onChange={(e) => setFilterOpsUserId(e.target.value)}
                style={{ padding: '0.35rem 0.5rem', borderRadius: 6, border: '1px solid #e2e8f0', fontSize: '0.875rem', minWidth: 140 }}
              >
                <option value="">运营负责人</option>
                {opsUsers.map((u) => (
                  <option key={u.id} value={u.id}>{u.name || u.email} ({u.role})</option>
                ))}
              </select>
            )}
            <input
              type="date"
              placeholder="创建时间起"
              value={filterCreatedStart}
              onChange={(e) => setFilterCreatedStart(e.target.value)}
              style={{ padding: '0.35rem 0.5rem', borderRadius: 6, border: '1px solid #e2e8f0', fontSize: '0.875rem' }}
            />
            <input
              type="date"
              placeholder="创建时间止"
              value={filterCreatedEnd}
              onChange={(e) => setFilterCreatedEnd(e.target.value)}
              style={{ padding: '0.35rem 0.5rem', borderRadius: 6, border: '1px solid #e2e8f0', fontSize: '0.875rem' }}
            />
            {(searchName || searchCreatorEmail || filterMemberMin !== '' || filterMemberMax !== '' || filterSku || filterOpsUserId || filterCreatedStart || filterCreatedEnd) && (
              <button
                type="button"
                className="btn btn-secondary btn-small"
                onClick={() => {
                  setSearchName('');
                  setSearchCreatorEmail('');
                  setFilterMemberMin('');
                  setFilterMemberMax('');
                  setFilterSku('');
                  setFilterOpsUserId('');
                  setFilterCreatedStart('');
                  setFilterCreatedEnd('');
                }}
              >
                清空
              </button>
            )}
          </div>
        </div>

        <div className="table-wrap">
          {loading ? (
            <p>加载中…</p>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>客户</th>
                  <th>创建者</th>
                  <th>人数</th>
                  <th>数据量</th>
                  <th>当前规格</th>
                  <th>创建时间</th>
                  <th>运营</th>
                  {isAll && <th>操作</th>}
                </tr>
              </thead>
              <tbody>
                {filteredSpaces.length === 0 && !loading ? (
                  <tr><td colSpan={isAll ? 8 : 7} style={{ textAlign: 'center', color: '#64748b', padding: '1.5rem' }}>暂无客户数据</td></tr>
                ) : (
                  filteredSpaces.map((row) => {
                    const a = assignmentBySpaceId[row.id];
                    const creatorUserId = adminUserIdBySpaceId[row.id];
                    const creator = creatorUserId ? creatorById[creatorUserId] : null;
                    const creatorEmail = creator?.email ?? '–';
                    const members = memberCountBySpaceId[row.id] ?? 0;
                    const dataTotal = dataTotalBySpaceId[row.id];
                    const sku = currentSkuBySpaceId[row.id] ?? '–';
                    return (
                      <tr
                        key={row.id}
                        style={{ cursor: 'pointer' }}
                        onClick={() => setSelectedSpaceId(row.id)}
                      >
                        <td>{row.name || '–'}</td>
                        <td>{creatorEmail}</td>
                        <td>{members}</td>
                        <td>{dataTotal != null ? dataTotal.toLocaleString() : '–'}</td>
                        <td>{sku}</td>
                        <td>{format(new Date(row.created_at), 'yyyy-MM-dd HH:mm')}</td>
                        <td>{a?.ops_users ? (a.ops_users.name || a.ops_users.email) : '–'}</td>
                        {isAll && (
                          <td onClick={(e) => e.stopPropagation()}>
                            <button
                              type="button"
                              className="btn btn-secondary btn-small"
                              onClick={() => { setAssigningSpaceId(row.id); setSelectedOpsUserId(a?.ops_user_id ?? ''); }}
                            >
                              <UserPlus size={14} style={{ verticalAlign: 'middle', marginRight: 4 }} />
                              {a ? '改派' : '分配'}
                            </button>
                          </td>
                        )}
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {assigningSpaceId && (
        <div className="modal-overlay" onClick={() => !submitting && setAssigningSpaceId(null)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <h3 style={{ margin: '0 0 1rem' }}>分配负责人</h3>
            <p style={{ margin: '0 0 0.75rem', fontSize: '0.9rem', color: '#64748b' }}>
              客户 ID：<code style={{ fontSize: '0.8rem' }}>{assigningSpaceId}</code>
            </p>
            <label style={{ display: 'block', marginBottom: '0.75rem' }}>
              <span style={{ display: 'block', marginBottom: 4, fontSize: '0.875rem' }}>运营人员</span>
              <select
                value={selectedOpsUserId}
                onChange={(e) => setSelectedOpsUserId(e.target.value)}
                style={{ width: '100%', padding: '0.5rem', borderRadius: 6 }}
              >
                <option value="">请选择</option>
                {opsUsers.map((u) => (
                  <option key={u.id} value={u.id}>{u.name || u.email} ({u.role})</option>
                ))}
              </select>
            </label>
            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
              <button type="button" className="btn btn-secondary" onClick={() => setAssigningSpaceId(null)} disabled={submitting}>
                取消
              </button>
              <button type="button" className="btn btn-primary" onClick={handleAssign} disabled={submitting || !selectedOpsUserId}>
                {submitting ? '提交中…' : '确定'}
              </button>
            </div>
          </div>
        </div>
      )}

      {selectedSpaceId && (
        <CustomerDetail
          spaceId={selectedSpaceId}
          spaceName={spaces.find((s) => s.id === selectedSpaceId)?.name ?? ''}
          creator={selectedSpaceId ? (() => {
            const uid = adminUserIdBySpaceId[selectedSpaceId];
            return uid ? creatorById[uid] : null;
          })() : null}
          onClose={() => setSelectedSpaceId(null)}
          onUpdated={() => load()}
          opsUser={opsUser}
        />
      )}
    </div>
  );
}

function CustomerDetail({
  spaceId,
  spaceName,
  creator,
  onClose,
  onUpdated,
  opsUser,
}: {
  spaceId: string;
  spaceName: string;
  creator: CreatorRow | null;
  onClose: () => void;
  onUpdated: () => void;
  opsUser: OpsUser | null;
}) {
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [followUps, setFollowUps] = useState<FollowUpRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [newFollowUp, setNewFollowUp] = useState('');
  const [submittingFollowUp, setSubmittingFollowUp] = useState(false);
  const [dataStats, setDataStats] = useState<{ receipts: number; invoices: number; inbound: number; outbound: number } | null>(null);
  const [statsError, setStatsError] = useState<string | null>(null);

  useEffect(() => {
    load();
  }, [spaceId]);

  async function load() {
    setLoading(true);
    setDataStats(null);
    setStatsError(null);
    try {
      const [ordersRes, followRes, statsRes] = await Promise.all([
        supabase.schema('crm').from('space_orders').select('id, space_id, status, started_at, expires_at, source, created_at, sku_edition(code, name)').eq('space_id', spaceId).order('created_at', { ascending: false }),
        supabase.schema('crm').from('space_follow_ups').select('id, space_id, ops_user_id, content, created_at, ops_users(name, email)').eq('space_id', spaceId).order('created_at', { ascending: false }),
        supabase.rpc('get_space_data_stats', { p_space_id: spaceId }),
      ]);
      if (!ordersRes.error) setOrders((ordersRes.data ?? []) as unknown as OrderRow[]);
      if (!followRes.error) setFollowUps((followRes.data ?? []) as unknown as FollowUpRow[]);
      if (!statsRes.error && statsRes.data) {
        const d = statsRes.data as { receipts?: number; invoices?: number; inbound?: number; outbound?: number };
        setDataStats({
          receipts: d.receipts ?? 0,
          invoices: d.invoices ?? 0,
          inbound: d.inbound ?? 0,
          outbound: d.outbound ?? 0,
        });
      } else if (statsRes.error) {
        setStatsError((statsRes.error as { message?: string }).message ?? '统计函数调用失败');
      }
    } catch (e) {
      setOrders([]);
      setFollowUps([]);
      setStatsError(e instanceof Error ? e.message : '统计请求异常');
    } finally {
      setLoading(false);
    }
  }

  async function handleAddFollowUp() {
    if (!newFollowUp.trim() || !opsUser?.id) return;
    setSubmittingFollowUp(true);
    try {
      const { error } = await supabase.schema('crm').from('space_follow_ups').insert({
        space_id: spaceId,
        ops_user_id: opsUser.id,
        content: newFollowUp.trim(),
      });
      if (!error) {
        setNewFollowUp('');
        load();
        onUpdated();
      }
    } finally {
      setSubmittingFollowUp(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-card"
        style={{ maxWidth: 560, width: '95%', maxHeight: '90vh', overflow: 'auto' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <h3 style={{ margin: 0 }}>客户详情</h3>
          <button type="button" aria-label="关闭" onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}>
            <X size={20} />
          </button>
        </div>
        <p style={{ margin: '0 0 1rem', fontSize: '0.9rem', color: '#64748b' }}>{spaceName || spaceId}</p>

        {loading ? (
          <p>加载中…</p>
        ) : (
          <>
            <section style={{ marginBottom: '1.25rem' }}>
              <h4 style={{ margin: '0 0 0.5rem', fontSize: '0.95rem' }}>创建者</h4>
              <p style={{ margin: 0, fontSize: '0.9rem' }}>
                {creator?.email ?? '–'}
              </p>
            </section>

            <section style={{ marginBottom: '1.25rem' }}>
              <h4 style={{ margin: '0 0 0.5rem', fontSize: '0.95rem' }}>数据数量</h4>
              {statsError && (
                <p style={{ margin: '0 0 0.5rem', fontSize: '0.85rem', color: '#b91c1c' }}>
                  数据统计失败：{statsError}
                </p>
              )}
              {dataStats ? (
                <ul style={{ margin: 0, paddingLeft: '1.25rem', fontSize: '0.9rem' }}>
                  <li>收据（receipt）：{dataStats.receipts} 条</li>
                  <li>发票（invoice）：{dataStats.invoices} 条</li>
                  <li>入库（inbound）：{dataStats.inbound} 条</li>
                  <li>出库（outbound）：{dataStats.outbound} 条</li>
                </ul>
              ) : (
                <p style={{ margin: 0, fontSize: '0.9rem' }}>–</p>
              )}
            </section>

            <section style={{ marginBottom: '1.25rem' }}>
              <h4 style={{ margin: '0 0 0.5rem', fontSize: '0.95rem' }}>历史订单</h4>
              <div className="table-wrap">
                {orders.length === 0 ? (
                  <p style={{ margin: 0, fontSize: '0.9rem', color: '#64748b' }}>暂无订单</p>
                ) : (
                  <table>
                    <thead>
                      <tr>
                        <th>规格</th>
                        <th>状态</th>
                        <th>生效时间</th>
                        <th>到期时间</th>
                      </tr>
                    </thead>
                    <tbody>
                      {orders.map((o) => (
                        <tr key={o.id}>
                          <td>{(o as { sku_edition?: { name?: string | null } }).sku_edition?.name ?? '–'}</td>
                          <td>{o.status}</td>
                          <td>{format(new Date(o.created_at), 'yyyy-MM-dd')}</td>
                          <td>{o.expires_at ? format(new Date(o.expires_at), 'yyyy-MM-dd') : '–'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </section>

            <section>
              <h4 style={{ margin: '0 0 0.5rem', fontSize: '0.95rem' }}>跟进记录</h4>
              <div style={{ marginBottom: '0.75rem' }}>
                <textarea
                  placeholder="添加跟进内容…"
                  value={newFollowUp}
                  onChange={(e) => setNewFollowUp(e.target.value)}
                  rows={2}
                  style={{ width: '100%', padding: '0.5rem', borderRadius: 6, border: '1px solid #e2e8f0', fontSize: '0.9rem', resize: 'vertical' }}
                />
                <button
                  type="button"
                  className="btn btn-primary btn-small"
                  style={{ marginTop: 4 }}
                  onClick={handleAddFollowUp}
                  disabled={submittingFollowUp || !newFollowUp.trim()}
                >
                  {submittingFollowUp ? '提交中…' : '添加'}
                </button>
              </div>
              {followUps.length === 0 ? (
                <p style={{ margin: 0, fontSize: '0.9rem', color: '#64748b' }}>暂无跟进记录</p>
              ) : (
                <ul style={{ margin: 0, paddingLeft: '1.25rem', fontSize: '0.9rem' }}>
                  {followUps.map((f) => (
                    <li key={f.id} style={{ marginBottom: '0.5rem' }}>
                      <span style={{ color: '#64748b' }}>{format(new Date(f.created_at), 'yyyy-MM-dd HH:mm')}</span>
                      {f.ops_users && <span style={{ marginLeft: 6, color: '#475569' }}>({f.ops_users.name || f.ops_users.email})</span>}
                      ：{f.content}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </>
        )}
      </div>
    </div>
  );
}
