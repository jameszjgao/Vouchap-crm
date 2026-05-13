import { useState, useEffect, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import type { OpsUser } from '../lib/ops-auth';
import { format } from 'date-fns';
import { Eye, Pencil, Plus } from 'lucide-react';

interface OrderRow {
  id: string;
  space_id: string;
  sku_id: string;
  status: string;
  started_at: string;
  expires_at: string | null;
  source: string;
  created_at: string;
  created_by_ops_user_id: string | null;
  metadata?: Record<string, unknown> | null;
  sku_edition?: { code: string; name: string };
  ops_users?: { name: string | null; email: string } | null;
}

interface SpaceOption {
  id: string;
  name: string | null;
}

interface SkuOption {
  id: string;
  code: string;
  name: string;
}

interface SpaceOrdersProps {
  opsUser: OpsUser | null;
  view: 'all' | 'my';
}

const SOURCE_LABELS: Record<string, string> = {
  registration: '注册',
  purchase: '购买',
  ops_grant: '运营开通',
};

function summarizeMetadata(meta: unknown): string {
  if (meta == null || typeof meta !== 'object') return '–';
  const o = meta as Record<string, unknown>;
  if (Object.keys(o).length === 0) return '–';
  try {
    const s = JSON.stringify(o);
    return s.length > 72 ? `${s.slice(0, 72)}…` : s;
  } catch {
    return '…';
  }
}

export default function SpaceOrders({ opsUser, view }: SpaceOrdersProps) {
  const [list, setList] = useState<OrderRow[]>([]);
  const [spaces, setSpaces] = useState<SpaceOption[]>([]);
  const [mySpaceIds, setMySpaceIds] = useState<Set<string>>(new Set());
  const [skus, setSkus] = useState<SkuOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [newSpaceId, setNewSpaceId] = useState('');
  const [newSkuId, setNewSkuId] = useState('');
  const [newExpiresAt, setNewExpiresAt] = useState('');
  /** Optional: extra engagement credits (firm) — metadata.engagement_credits_added (with FIRM_ANNUAL) */
  const [newEngagementCreditsAdded, setNewEngagementCreditsAdded] = useState('');
  /** Optional: grant recognition credits (client) — metadata.recognition_credits_added */
  const [newRecognitionCreditsAdded, setNewRecognitionCreditsAdded] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const [entitlementsModal, setEntitlementsModal] = useState<{
    spaceId: string;
    title: string;
    loading: boolean;
    text: string;
    error: string | null;
  } | null>(null);

  const [editRow, setEditRow] = useState<OrderRow | null>(null);
  const [editStatus, setEditStatus] = useState('active');
  const [editExpiresAt, setEditExpiresAt] = useState('');
  const [editMetadataText, setEditMetadataText] = useState('{}');
  const [editSubmitting, setEditSubmitting] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  const isAll = view === 'all';
  const spaceNameById = useMemo(() => {
    const m: Record<string, string> = {};
    spaces.forEach((s) => { m[s.id] = s.name || `${s.id.slice(0, 8)}…`; });
    return m;
  }, [spaces]);
  const spacesForNewOrder = useMemo(() => (isAll ? spaces : spaces.filter((s) => mySpaceIds.has(s.id))), [isAll, spaces, mySpaceIds]);

  useEffect(() => {
    load();
  }, [opsUser?.id, view]);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      if (isAll) {
        const [ordersRes, spacesRes, skusRes] = await Promise.all([
          supabase.schema('crm').from('space_orders').select(`
            id, space_id, sku_id, status, started_at, expires_at, source, created_at, created_by_ops_user_id, metadata,
            sku_edition(code, name),
            ops_users(name, email)
          `).order('created_at', { ascending: false }).limit(200),
          supabase.from('spaces').select('id, name').order('created_at', { ascending: false }).limit(500),
          supabase.schema('crm').from('sku_edition').select('id, code, name').order('sort_order'),
        ]);
        const err = ordersRes.error || spacesRes.error || skusRes.error;
        if (err) setError(err.message || '请求失败');
        if (!ordersRes.error) setList((ordersRes.data ?? []) as unknown as OrderRow[]);
        if (!spacesRes.error) setSpaces(spacesRes.data ?? []);
        if (!skusRes.error) {
          const raw = skusRes.data ?? [];
          setSkus(raw.filter((s) => !['CLIENT_RECOGNITION_BASE', 'FIRM_CLIENT_SIGNING_BONUS'].includes(s.code)));
        }
        setMySpaceIds(new Set());
      } else if (opsUser?.id) {
        const [assignmentsRes, ordersRes, spacesRes, skusRes] = await Promise.all([
          supabase.schema('crm').from('ops_assignments').select('space_id').eq('ops_user_id', opsUser.id),
          supabase.schema('crm').from('space_orders').select(`
            id, space_id, sku_id, status, started_at, expires_at, source, created_at, created_by_ops_user_id, metadata,
            sku_edition(code, name),
            ops_users(name, email)
          `).order('created_at', { ascending: false }).limit(200),
          supabase.from('spaces').select('id, name').order('created_at', { ascending: false }).limit(500),
          supabase.schema('crm').from('sku_edition').select('id, code, name').order('sort_order'),
        ]);
        const err = ordersRes.error || spacesRes.error || skusRes.error;
        if (err) setError(err.message || '请求失败');
        const ids = new Set(((assignmentsRes.data ?? []) as { space_id: string }[]).map((a) => a.space_id));
        setMySpaceIds(ids);
        if (!ordersRes.error) {
          const allOrders = (ordersRes.data ?? []) as unknown as OrderRow[];
          setList(allOrders.filter((o) => ids.has(o.space_id)));
        }
        if (!spacesRes.error) setSpaces(spacesRes.data ?? []);
        if (!skusRes.error) {
          const raw = skusRes.data ?? [];
          setSkus(raw.filter((s) => !['CLIENT_RECOGNITION_BASE', 'FIRM_CLIENT_SIGNING_BONUS'].includes(s.code)));
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : '加载失败');
    } finally {
      setLoading(false);
    }
  }

  async function openEntitlements(spaceId: string, title: string) {
    setEntitlementsModal({ spaceId, title, loading: true, text: '', error: null });
    try {
      const { data, error: rpcError } = await supabase.schema('crm').rpc('get_space_entitlements', {
        p_space_id: spaceId,
      });
      if (rpcError) {
        setEntitlementsModal((m) => (m ? { ...m, loading: false, error: rpcError.message } : null));
        return;
      }
      const text = JSON.stringify(data, null, 2);
      setEntitlementsModal({ spaceId, title, loading: false, text, error: null });
    } catch (e) {
      setEntitlementsModal((m) => (m ? {
        ...m,
        loading: false,
        error: e instanceof Error ? e.message : '加载失败',
      } : null));
    }
  }

  function openEdit(row: OrderRow) {
    setEditRow(row);
    setEditStatus(row.status);
    setEditExpiresAt(row.expires_at ? format(new Date(row.expires_at), 'yyyy-MM-dd') : '');
    setEditMetadataText(JSON.stringify(row.metadata ?? {}, null, 2));
    setEditError(null);
  }

  async function handleEditSave() {
    if (!editRow) return;
    setEditSubmitting(true);
    setEditError(null);
    try {
      let meta: Record<string, unknown>;
      try {
        const parsed = JSON.parse(editMetadataText.trim() || '{}');
        if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
          setEditError('metadata 须为 JSON 对象');
          return;
        }
        meta = parsed as Record<string, unknown>;
      } catch {
        setEditError('metadata JSON 无效');
        return;
      }

      const { error: upErr } = await supabase.schema('crm').from('space_orders').update({
        status: editStatus,
        expires_at: editExpiresAt ? new Date(editExpiresAt).toISOString() : null,
        metadata: meta,
      }).eq('id', editRow.id);

      if (upErr) {
        setEditError(upErr.message);
        return;
      }
      setEditRow(null);
      load();
    } finally {
      setEditSubmitting(false);
    }
  }

  async function handleCreateOrder() {
    if (!newSpaceId || !newSkuId || !opsUser?.id) return;
    setSubmitting(true);
    setCreateError(null);
    try {
      const metadata: Record<string, number> = {};
      const eg = parseInt(newEngagementCreditsAdded.trim(), 10);
      if (Number.isFinite(eg) && eg > 0) metadata.engagement_credits_added = eg;
      const cr = parseInt(newRecognitionCreditsAdded.trim(), 10);
      if (Number.isFinite(cr) && cr > 0) metadata.recognition_credits_added = cr;

      const { error: insErr } = await supabase.schema('crm').from('space_orders').insert({
        space_id: newSpaceId,
        sku_id: newSkuId,
        status: 'active',
        started_at: new Date().toISOString(),
        expires_at: newExpiresAt ? new Date(newExpiresAt).toISOString() : null,
        source: 'ops_grant',
        created_by_ops_user_id: opsUser.id,
        ...(Object.keys(metadata).length > 0 ? { metadata } : {}),
      });
      if (insErr) {
        setCreateError(insErr.message);
        return;
      }
      setShowNew(false);
      setNewSpaceId('');
      setNewSkuId('');
      setNewExpiresAt('');
      setNewEngagementCreditsAdded('');
      setNewRecognitionCreditsAdded('');
      load();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div>
      <h1 style={{ margin: '0 0 1rem', fontSize: '1.35rem' }}>{isAll ? '全部订单' : '我的客户订单'}</h1>
      <div className="page-card">
        <p style={{ margin: '0 0 0.75rem', fontSize: '0.9rem', color: '#64748b' }}>
          {isAll ? '全部客户订单。' : '仅我负责的客户的订单。'} 按客户配置订单，控制版本与功能权益；运营可为客户开通或延长权益；可查阅当前权益快照并编辑订单状态与 metadata。
        </p>
        <div style={{ marginBottom: '1rem' }}>
          <button type="button" className="btn btn-primary" onClick={() => { setCreateError(null); setShowNew(true); }}>
            <Plus size={18} style={{ verticalAlign: 'middle', marginRight: 6 }} />
            新建订单
          </button>
        </div>
        {error && (
          <div className="page-card" style={{ marginBottom: '1rem', background: '#fef2f2', color: '#b91c1c' }}>
            <strong>加载失败：</strong> {error}
            <p style={{ margin: '0.5rem 0 0', fontSize: '0.875rem' }}>
              请确认：1) Supabase 控制台 → 项目设置 → API → Exposed schemas 已包含 <code>crm</code>；2) 已执行 <code>sql/crm-grant-orders-assignments.sql</code> 授权（含 <code>UPDATE</code> on <code>space_orders</code>）；3) 已应用迁移 <code>20260513110000_get_space_entitlements_allow_crm_ops.sql</code> 以便运营账号调用 <code>get_space_entitlements</code>。
            </p>
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
                  <th>权益包</th>
                  <th>状态</th>
                  <th>开始时间</th>
                  <th>到期时间</th>
                  <th>metadata</th>
                  <th>来源</th>
                  <th>创建人</th>
                  <th>创建时间</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {list.length === 0 && !loading ? (
                  <tr><td colSpan={10} style={{ textAlign: 'center', color: '#64748b', padding: '1.5rem' }}>暂无订单数据</td></tr>
                ) : list.map((row) => {
                  const metaSummary = summarizeMetadata(row.metadata);
                  return (
                  <tr key={row.id}>
                    <td>{spaceNameById[row.space_id] ?? `${row.space_id.slice(0, 8)}…`}</td>
                    <td>{row.sku_edition ? `${row.sku_edition.name} (${row.sku_edition.code})` : row.sku_id}</td>
                    <td>{row.status}</td>
                    <td>{format(new Date(row.started_at), 'yyyy-MM-dd')}</td>
                    <td>{row.expires_at ? format(new Date(row.expires_at), 'yyyy-MM-dd') : '永久'}</td>
                    <td style={{ maxWidth: 220, fontSize: '0.8rem', color: '#475569', wordBreak: 'break-all' }} title={metaSummary !== '–' ? metaSummary : undefined}>
                      {metaSummary}
                    </td>
                    <td>{SOURCE_LABELS[row.source] ?? row.source}</td>
                    <td>{row.ops_users ? (row.ops_users.name || row.ops_users.email) : '–'}</td>
                    <td>{format(new Date(row.created_at), 'yyyy-MM-dd HH:mm')}</td>
                    <td>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                        <button
                          type="button"
                          className="btn btn-secondary btn-small"
                          onClick={() => openEntitlements(row.space_id, spaceNameById[row.space_id] ?? row.space_id)}
                        >
                          <Eye size={14} style={{ verticalAlign: 'middle', marginRight: 4 }} />
                          权益
                        </button>
                        <button type="button" className="btn btn-secondary btn-small" onClick={() => openEdit(row)}>
                          <Pencil size={14} style={{ verticalAlign: 'middle', marginRight: 4 }} />
                          编辑
                        </button>
                      </div>
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {showNew && (
        <div className="modal-overlay" onClick={() => !submitting && setShowNew(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <h3 style={{ margin: '0 0 1rem' }}>新建客户订单</h3>
            {createError && (
              <div style={{ marginBottom: '0.75rem', padding: '0.5rem', background: '#fef2f2', color: '#b91c1c', borderRadius: 6, fontSize: '0.875rem' }}>
                {createError}
              </div>
            )}
            <label style={{ display: 'block', marginBottom: '0.75rem' }}>
              <span style={{ display: 'block', marginBottom: 4, fontSize: '0.875rem' }}>客户</span>
              <select
                value={newSpaceId}
                onChange={(e) => setNewSpaceId(e.target.value)}
                style={{ width: '100%', padding: '0.5rem', borderRadius: 6 }}
              >
                <option value="">请选择</option>
                {spacesForNewOrder.map((s) => (
                  <option key={s.id} value={s.id}>{s.name || s.id.slice(0, 8)}</option>
                ))}
              </select>
            </label>
            <label style={{ display: 'block', marginBottom: '0.75rem' }}>
              <span style={{ display: 'block', marginBottom: 4, fontSize: '0.875rem' }}>权益包 (SKU)</span>
              <select
                value={newSkuId}
                onChange={(e) => setNewSkuId(e.target.value)}
                style={{ width: '100%', padding: '0.5rem', borderRadius: 6 }}
              >
                <option value="">请选择</option>
                {skus.map((s) => (
                  <option key={s.id} value={s.id}>{s.name} ({s.code})</option>
                ))}
              </select>
            </label>
            <label style={{ display: 'block', marginBottom: '0.75rem' }}>
              <span style={{ display: 'block', marginBottom: 4, fontSize: '0.875rem' }}>到期日（可选）</span>
              <input
                type="date"
                value={newExpiresAt}
                onChange={(e) => setNewExpiresAt(e.target.value)}
                style={{ width: '100%', padding: '0.5rem', borderRadius: 6 }}
              />
            </label>
            <label style={{ display: 'block', marginBottom: '0.75rem' }}>
              <span style={{ display: 'block', marginBottom: 4, fontSize: '0.875rem' }}>
                增购 engagement credits（可选，metadata.engagement_credits_added，与 FIRM_ANNUAL 配合）
              </span>
              <input
                type="number"
                min={0}
                placeholder="例如整包购入的 credits 数"
                value={newEngagementCreditsAdded}
                onChange={(e) => setNewEngagementCreditsAdded(e.target.value)}
                style={{ width: '100%', padding: '0.5rem', borderRadius: 6 }}
              />
            </label>
            <label style={{ display: 'block', marginBottom: '0.75rem' }}>
              <span style={{ display: 'block', marginBottom: 4, fontSize: '0.875rem' }}>
                增加 client 识别 credits（可选，metadata.recognition_credits_added）
              </span>
              <input
                type="number"
                min={0}
                placeholder="例如 100"
                value={newRecognitionCreditsAdded}
                onChange={(e) => setNewRecognitionCreditsAdded(e.target.value)}
                style={{ width: '100%', padding: '0.5rem', borderRadius: 6 }}
              />
            </label>
            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
              <button type="button" className="btn btn-secondary" onClick={() => setShowNew(false)} disabled={submitting}>取消</button>
              <button type="button" className="btn btn-primary" onClick={handleCreateOrder} disabled={submitting || !newSpaceId || !newSkuId}>
                {submitting ? '提交中…' : '创建'}
              </button>
            </div>
          </div>
        </div>
      )}

      {entitlementsModal && (
        <div className="modal-overlay" onClick={() => setEntitlementsModal(null)}>
          <div className="modal-card" style={{ maxWidth: 720 }} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ margin: '0 0 0.5rem' }}>权益快照</h3>
            <p style={{ margin: '0 0 1rem', fontSize: '0.875rem', color: '#64748b' }}>{entitlementsModal.title}</p>
            {entitlementsModal.loading && <p>加载中…</p>}
            {entitlementsModal.error && (
              <div style={{ padding: '0.5rem', background: '#fef2f2', color: '#b91c1c', borderRadius: 6 }}>{entitlementsModal.error}</div>
            )}
            {!entitlementsModal.loading && !entitlementsModal.error && (
              <pre style={{ margin: 0, maxHeight: '60vh', overflow: 'auto', fontSize: '0.8rem', background: '#f8fafc', padding: '0.75rem', borderRadius: 6, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                {entitlementsModal.text}
              </pre>
            )}
            <div style={{ marginTop: '1rem', display: 'flex', justifyContent: 'flex-end' }}>
              <button type="button" className="btn btn-secondary" onClick={() => setEntitlementsModal(null)}>关闭</button>
            </div>
          </div>
        </div>
      )}

      {editRow && (
        <div className="modal-overlay" onClick={() => !editSubmitting && setEditRow(null)}>
          <div className="modal-card" style={{ maxWidth: 560 }} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ margin: '0 0 0.5rem' }}>编辑订单</h3>
            <p style={{ margin: '0 0 1rem', fontSize: '0.875rem', color: '#64748b' }}>
              {editRow.sku_edition ? `${editRow.sku_edition.name} (${editRow.sku_edition.code})` : editRow.sku_id}
              {' · '}
              {spaceNameById[editRow.space_id] ?? editRow.space_id}
            </p>
            {editError && (
              <div style={{ marginBottom: '0.75rem', padding: '0.5rem', background: '#fef2f2', color: '#b91c1c', borderRadius: 6, fontSize: '0.875rem' }}>
                {editError}
              </div>
            )}
            <label style={{ display: 'block', marginBottom: '0.75rem' }}>
              <span style={{ display: 'block', marginBottom: 4, fontSize: '0.875rem' }}>状态</span>
              <select
                value={editStatus}
                onChange={(e) => setEditStatus(e.target.value)}
                style={{ width: '100%', padding: '0.5rem', borderRadius: 6 }}
              >
                <option value="pending">pending</option>
                <option value="active">active</option>
                <option value="expired">expired</option>
                <option value="cancelled">cancelled</option>
              </select>
            </label>
            <label style={{ display: 'block', marginBottom: '0.75rem' }}>
              <span style={{ display: 'block', marginBottom: 4, fontSize: '0.875rem' }}>到期日（空 = 永久）</span>
              <input
                type="date"
                value={editExpiresAt}
                onChange={(e) => setEditExpiresAt(e.target.value)}
                style={{ width: '100%', padding: '0.5rem', borderRadius: 6 }}
              />
            </label>
            <label style={{ display: 'block', marginBottom: '0.75rem' }}>
              <span style={{ display: 'block', marginBottom: 4, fontSize: '0.875rem' }}>metadata（JSON 对象）</span>
              <textarea
                value={editMetadataText}
                onChange={(e) => setEditMetadataText(e.target.value)}
                rows={10}
                style={{ width: '100%', padding: '0.5rem', borderRadius: 6, fontFamily: 'monospace', fontSize: '0.8rem' }}
              />
            </label>
            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
              <button type="button" className="btn btn-secondary" onClick={() => setEditRow(null)} disabled={editSubmitting}>取消</button>
              <button type="button" className="btn btn-primary" onClick={handleEditSave} disabled={editSubmitting}>
                {editSubmitting ? '保存中…' : '保存'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
