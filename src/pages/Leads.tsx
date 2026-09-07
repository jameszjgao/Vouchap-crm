import { useState, useEffect, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import type { OpsUser } from '../lib/ops-auth';
import { useProduct } from '../lib/product-context';
import { getTenantStats, listOrders, listTenants, type HubOrder, type HubTenant } from '../lib/hub-api';
import { productName, tenantKindLabel } from '../lib/products';
import { format } from 'date-fns';
import { UserPlus, X } from 'lucide-react';

interface AssignmentRow {
  tenant_id: string;
  ops_user_id: string;
  role: string;
  assigned_at: string;
  ops_users?: { name: string | null; email: string } | null;
}

interface FollowUpRow {
  id: string;
  tenant_id: string;
  ops_user_id: string;
  content: string;
  created_at: string;
  ops_users?: { name: string | null; email: string } | null;
}

interface LeadsProps {
  opsUser: OpsUser | null;
  view: 'all' | 'my';
}

export default function Leads({ opsUser, view }: LeadsProps) {
  const { productId } = useProduct();
  const [spaces, setSpaces] = useState<HubTenant[]>([]);
  const [assignments, setAssignments] = useState<AssignmentRow[]>([]);
  const [opsUsers, setOpsUsers] = useState<OpsUser[]>([]);
  const [orders, setOrders] = useState<HubOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
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

  const isAll = view === 'all';
  const assignmentBySpaceId = useMemo(() => {
    const m: Record<string, AssignmentRow> = {};
    assignments.forEach((a) => { m[a.tenant_id] = a; });
    return m;
  }, [assignments]);

  const currentSkuBySpaceId = useMemo(() => {
    const now = new Date();
    const bySpace: Record<string, string> = {};
    orders
      .filter((o) => o.status === 'active' && (!o.expires_at || new Date(o.expires_at) > now))
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .forEach((o) => {
        const tid = o.tenantId || o.space_id;
        if (bySpace[tid] == null) bySpace[tid] = o.sku_edition?.name ?? '–';
      });
    return bySpace;
  }, [orders]);

  const distinctSkuNames = useMemo(() => {
    const set = new Set<string>();
    Object.values(currentSkuBySpaceId).forEach((n) => { if (n && n !== '–') set.add(n); });
    return Array.from(set).sort();
  }, [currentSkuBySpaceId]);

  const filteredSpaces = useMemo(() => {
    return spaces.filter((s) => {
      if (searchName.trim()) {
        const name = (s.name ?? '').toLowerCase();
        if (!name.includes(searchName.trim().toLowerCase())) return false;
      }
      const creatorEmail = s.creatorEmail ?? '';
      if (searchCreatorEmail.trim() && !creatorEmail.toLowerCase().includes(searchCreatorEmail.trim().toLowerCase())) return false;
      const members = s.memberCount ?? 0;
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
        if (new Date(s.createdAt).getTime() < start) return false;
      }
      if (filterCreatedEnd) {
        const end = new Date(filterCreatedEnd + 'T23:59:59.999').getTime();
        if (new Date(s.createdAt).getTime() > end) return false;
      }
      return true;
    });
  }, [spaces, searchName, searchCreatorEmail, filterMemberMin, filterMemberMax, filterSku, filterOpsUserId, filterCreatedStart, filterCreatedEnd, currentSkuBySpaceId, assignmentBySpaceId]);

  useEffect(() => {
    load();
  }, [opsUser?.id, view, productId]);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const [tenants, assignmentsRes, usersRes, productOrders] = await Promise.all([
        listTenants(productId),
        supabase.schema('crm').from('ops_assignments').select(
          'tenant_id, ops_user_id, role, assigned_at, ops_users(name, email)',
        ).eq('product_id', productId).order('assigned_at', { ascending: false }),
        view === 'all'
          ? supabase.schema('crm').from('ops_users').select('id, user_id, email, name, role, created_at, updated_at').order('email')
          : Promise.resolve({ data: [] as OpsUser[], error: null }),
        listOrders(productId),
      ]);

      const allAssignments = (assignmentsRes.data ?? []) as unknown as AssignmentRow[];
      if (!assignmentsRes.error) setAssignments(allAssignments);
      if (view === 'all' && usersRes && !(usersRes as { error: unknown }).error) {
        setOpsUsers(((usersRes as { data: OpsUser[] }).data ?? []).map((u) => ({
          ...u,
          created_at: String(u.created_at),
          updated_at: String((u as { updated_at?: unknown }).updated_at ?? ''),
        })));
      }
      setOrders(productOrders);

      if (view === 'all') {
        setSpaces(tenants);
      } else if (opsUser?.id) {
        const myIds = new Set(allAssignments.filter((a) => a.ops_user_id === opsUser.id).map((a) => a.tenant_id));
        setSpaces(tenants.filter((t) => myIds.has(t.id)));
      } else {
        setSpaces([]);
      }
    } catch (e) {
      setSpaces([]);
      setError(e instanceof Error ? e.message : '加载失败');
    } finally {
      setLoading(false);
    }
  }

  async function handleAssign() {
    if (!assigningSpaceId || !selectedOpsUserId) return;
    setSubmitting(true);
    try {
      const { error: upErr } = await supabase
        .schema('crm')
        .from('ops_assignments')
        .upsert(
          { product_id: productId, tenant_id: assigningSpaceId, ops_user_id: selectedOpsUserId, role: 'primary' },
          { onConflict: 'product_id,tenant_id' },
        );
      if (!upErr) {
        setAssigningSpaceId(null);
        setSelectedOpsUserId('');
        load();
      } else {
        setError(upErr.message);
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div>
      <h1 style={{ margin: '0 0 1rem', fontSize: '1.35rem' }}>
        {isAll ? '全部客户' : '我的客户'} · {productName(productId)}
      </h1>
      <div className="page-card">
        <p style={{ margin: '0 0 0.75rem', fontSize: '0.9rem', color: '#64748b' }}>
          {isAll ? '当前产品的全部客户，可分配负责人。' : '仅展示分配给我的客户。'}
        </p>
        {error && (
          <div style={{ marginBottom: '1rem', padding: '0.75rem', background: '#fef2f2', color: '#b91c1c', borderRadius: 6 }}>
            {error}
          </div>
        )}

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
              value={filterCreatedStart}
              onChange={(e) => setFilterCreatedStart(e.target.value)}
              style={{ padding: '0.35rem 0.5rem', borderRadius: 6, border: '1px solid #e2e8f0', fontSize: '0.875rem' }}
            />
            <input
              type="date"
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
                  <th>类型</th>
                  <th>创建者</th>
                  <th>人数</th>
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
                    return (
                      <tr key={row.id} style={{ cursor: 'pointer' }} onClick={() => setSelectedSpaceId(row.id)}>
                        <td>{row.name || '–'}</td>
                        <td>{tenantKindLabel(productId, row.kind)}</td>
                        <td>{row.creatorEmail ?? '–'}</td>
                        <td>{row.memberCount ?? 0}</td>
                        <td>{currentSkuBySpaceId[row.id] ?? '–'}</td>
                        <td>{format(new Date(row.createdAt), 'yyyy-MM-dd HH:mm')}</td>
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
              <button type="button" className="btn btn-secondary" onClick={() => setAssigningSpaceId(null)} disabled={submitting}>取消</button>
              <button type="button" className="btn btn-primary" onClick={handleAssign} disabled={submitting || !selectedOpsUserId}>
                {submitting ? '提交中…' : '确定'}
              </button>
            </div>
          </div>
        </div>
      )}

      {selectedSpaceId && (
        <CustomerDetail
          productId={productId}
          spaceId={selectedSpaceId}
          spaceName={spaces.find((s) => s.id === selectedSpaceId)?.name ?? ''}
          creatorEmail={spaces.find((s) => s.id === selectedSpaceId)?.creatorEmail ?? null}
          onClose={() => setSelectedSpaceId(null)}
          onUpdated={() => load()}
          opsUser={opsUser}
        />
      )}
    </div>
  );
}

function CustomerDetail({
  productId,
  spaceId,
  spaceName,
  creatorEmail,
  onClose,
  onUpdated,
  opsUser,
}: {
  productId: import('../lib/products').ProductId;
  spaceId: string;
  spaceName: string;
  creatorEmail: string | null;
  onClose: () => void;
  onUpdated: () => void;
  opsUser: OpsUser | null;
}) {
  const [orders, setOrders] = useState<HubOrder[]>([]);
  const [followUps, setFollowUps] = useState<FollowUpRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [newFollowUp, setNewFollowUp] = useState('');
  const [submittingFollowUp, setSubmittingFollowUp] = useState(false);
  const [dataStats, setDataStats] = useState<{ receipts?: number; invoices?: number; inbound?: number; outbound?: number } | null>(null);

  useEffect(() => {
    load();
  }, [spaceId, productId]);

  async function load() {
    setLoading(true);
    try {
      const [allOrders, followRes, stats] = await Promise.all([
        listOrders(productId),
        supabase.schema('crm').from('tenant_follow_ups').select(
          'id, tenant_id, ops_user_id, content, created_at, ops_users(name, email)',
        ).eq('product_id', productId).eq('tenant_id', spaceId).order('created_at', { ascending: false }),
        getTenantStats(productId, spaceId),
      ]);
      setOrders(allOrders.filter((o) => (o.tenantId || o.space_id) === spaceId));
      if (!followRes.error) setFollowUps((followRes.data ?? []) as unknown as FollowUpRow[]);
      setDataStats(stats && typeof stats === 'object' ? stats as typeof dataStats : null);
    } catch {
      setOrders([]);
      setFollowUps([]);
    } finally {
      setLoading(false);
    }
  }

  async function handleAddFollowUp() {
    if (!newFollowUp.trim() || !opsUser?.id) return;
    setSubmittingFollowUp(true);
    try {
      const { error } = await supabase.schema('crm').from('tenant_follow_ups').insert({
        product_id: productId,
        tenant_id: spaceId,
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
      <div className="modal-card" style={{ maxWidth: 560, width: '95%', maxHeight: '90vh', overflow: 'auto' }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <h3 style={{ margin: 0 }}>客户详情</h3>
          <button type="button" aria-label="关闭" onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}>
            <X size={20} />
          </button>
        </div>
        <p style={{ margin: '0 0 1rem', fontSize: '0.9rem', color: '#64748b' }}>{spaceName || spaceId}</p>
        {loading ? <p>加载中…</p> : (
          <>
            <section style={{ marginBottom: '1.25rem' }}>
              <h4 style={{ margin: '0 0 0.5rem', fontSize: '0.95rem' }}>创建者</h4>
              <p style={{ margin: 0, fontSize: '0.9rem' }}>{creatorEmail ?? '–'}</p>
            </section>
            <section style={{ marginBottom: '1.25rem' }}>
              <h4 style={{ margin: '0 0 0.5rem', fontSize: '0.95rem' }}>数据数量</h4>
              {dataStats ? (
                <ul style={{ margin: 0, paddingLeft: '1.25rem', fontSize: '0.9rem' }}>
                  <li>收据：{dataStats.receipts ?? 0} 条</li>
                  <li>发票：{dataStats.invoices ?? 0} 条</li>
                  <li>入库：{dataStats.inbound ?? 0} 条</li>
                  <li>出库：{dataStats.outbound ?? 0} 条</li>
                </ul>
              ) : (
                <p style={{ margin: 0, fontSize: '0.9rem', color: '#64748b' }}>该产品未提供业务数据统计。</p>
              )}
            </section>
            <section style={{ marginBottom: '1.25rem' }}>
              <h4 style={{ margin: '0 0 0.5rem', fontSize: '0.95rem' }}>历史订单</h4>
              {orders.length === 0 ? (
                <p style={{ margin: 0, fontSize: '0.9rem', color: '#64748b' }}>暂无订单</p>
              ) : (
                <table>
                  <thead>
                    <tr>
                      <th>规格</th>
                      <th>状态</th>
                      <th>到期</th>
                    </tr>
                  </thead>
                  <tbody>
                    {orders.map((o) => (
                      <tr key={o.id}>
                        <td>{o.sku_edition?.name ?? '–'}</td>
                        <td>{o.status}</td>
                        <td>{o.expires_at ? format(new Date(o.expires_at), 'yyyy-MM-dd') : '–'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </section>
            <section>
              <h4 style={{ margin: '0 0 0.5rem', fontSize: '0.95rem' }}>跟进记录</h4>
              <textarea
                placeholder="添加跟进内容…"
                value={newFollowUp}
                onChange={(e) => setNewFollowUp(e.target.value)}
                rows={2}
                style={{ width: '100%', padding: '0.5rem', borderRadius: 6, border: '1px solid #e2e8f0', fontSize: '0.9rem', resize: 'vertical' }}
              />
              <button type="button" className="btn btn-primary btn-small" style={{ marginTop: 4 }} onClick={handleAddFollowUp} disabled={submittingFollowUp || !newFollowUp.trim()}>
                {submittingFollowUp ? '提交中…' : '添加'}
              </button>
              {followUps.length === 0 ? (
                <p style={{ margin: '0.75rem 0 0', fontSize: '0.9rem', color: '#64748b' }}>暂无跟进记录</p>
              ) : (
                <ul style={{ margin: '0.75rem 0 0', paddingLeft: '1.25rem', fontSize: '0.9rem' }}>
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
